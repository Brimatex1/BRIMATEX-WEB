// مزامنة حالات الطلبات من أودو — ومنها تُرسل الإشعارات.
//
// لماذا وُجدت: الإشعار كان يُرسل فقط حين تتغيّر الحالة من لوحة إدارة المتجر
// (‎PATCH /api/admin/orders/:name‎ أو تسجيل دفعة). لكن الفريق يعمل في أودو،
// فتأكيد الفاتورة أو تسجيل الدفع يحدث هناك ولا يعلم به المتجر — فلا يصل
// العميل إشعارٌ عن طلبٍ تغيّرت حالته فعلاً. هذه الحلقة تقرأ أودو دورياً،
// تُحدّث السجلّ المحلي، وتنادي push.notifyOrderStage على ما تبدّل.
//
// المنطق منفصل عن السكربت (scripts/sync-order-status.js) كي يُختبَر بعميل
// أودو مُستعار بلا شبكة ولا خادم.

const DONE_STAGES = new Set(['done', 'cancelled']);

/**
 * حالة الفاتورة في أودو → حقول السجلّ المحلي.
 *
 * `state` في account.move: draft | posted | cancel. والدفع في أودو الحديث
 * حقلٌ منفصل (`payment_state`)، ولهذا لا يكفي `state` وحده — قراءته وحدها
 * كانت ستُبقي كل طلب مدفوع في «في الطريق» إلى الأبد.
 */
function updatesFromInvoice(inv) {
  if (!inv) return null;
  const state = String(inv.state || '');
  const paid = String(inv.paymentState || '') === 'paid';

  const updates = {};
  if (state === 'cancel') updates.invoiceStatus = 'cancel';
  else if (state === 'posted') updates.invoiceStatus = 'posted';
  else updates.invoiceStatus = 'draft';

  updates.paymentStatus = paid ? 'paid' : 'unpaid';
  return updates;
}

/** ما يستحقّ سؤال أودو عنه: طلبٌ لم ينته بعد وله فاتورة في أودو. */
function needsCheck(order, stageOf) {
  return Boolean(order?.odooInvoiceId) && !DONE_STAGES.has(stageOf(order));
}

/**
 * يمرّ على الطلبات غير المنتهية، يسأل أودو عن فواتيرها، ويُحدّث ما تبدّل.
 *
 * `deps` تُمرَّر كاملةً كي يعمل الاختبار بعميلٍ مُستعار:
 *   odoo    { isConfigured, readInvoice(id) → { state, paymentState } | null }
 *   orders  { listOrders, updateOrder }
 *   push    { notifyOrderStage, stageOf }
 *
 * لا يرمي أبداً: خطأٌ في طلبٍ واحد (فاتورة محذوفة، انقطاع شبكة) لا يوقف
 * الباقي، فمهمّة cron لا تصير صامتة بسبب سجلٍّ واحد فاسد.
 */
async function syncOrderStatuses({ odoo, orders, push, limit = 200, log = () => {} }) {
  const summary = { checked: 0, changed: 0, notified: 0, failed: 0, skipped: 0 };

  if (!odoo.isConfigured()) {
    summary.skipped = 1;
    log('أودو غير مُعدّ — لا مزامنة (وضع تجريبي)');
    return summary;
  }

  const all = await orders.listOrders({ limit });
  const pending = all.filter((o) => needsCheck(o, push.stageOf));
  log(`طلبات غير منتهية بفواتير أودو: ${pending.length} من ${all.length}`);

  for (const order of pending) {
    summary.checked++;
    let inv;
    try {
      inv = await odoo.readInvoice(order.odooInvoiceId);
    } catch (err) {
      summary.failed++;
      log(`✗ ${order.orderName}: تعذّر قراءة الفاتورة — ${err.message}`);
      continue;
    }
    if (!inv) {
      summary.failed++;
      log(`✗ ${order.orderName}: الفاتورة ${order.odooInvoiceId} غير موجودة في أودو`);
      continue;
    }

    const updates = updatesFromInvoice(inv);
    const before = order;
    const after = { ...order, ...updates };
    if (push.stageOf(after) === push.stageOf(before)) continue;

    // التاريخ يُكتب عند الانتقال إلى «مدفوع» فقط، ولا يُلمس بعدها.
    if (updates.paymentStatus === 'paid' && !order.paidAt) {
      updates.paidAt = new Date().toISOString();
    }

    try {
      const saved = await orders.updateOrder(order.orderName, updates);
      summary.changed++;
      const result = await push.notifyOrderStage(before, saved || after);
      summary.notified += result?.sent || 0;
      log(
        `▸ ${order.orderName}: ${push.stageOf(before)} → ${push.stageOf(after)}` +
          ` · إشعارات: ${result?.sent || 0}${result?.reason ? ` (${result.reason})` : ''}`
      );
    } catch (err) {
      summary.failed++;
      log(`✗ ${order.orderName}: تعذّر التحديث — ${err.message}`);
    }
  }

  return summary;
}

module.exports = { syncOrderStatuses, updatesFromInvoice, needsCheck };
