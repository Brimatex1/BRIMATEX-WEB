// Syncing order stages from Odoo - and sending notifications from there.
//
// Why it exists: a notification only went out when the stage changed from the
// shop's dashboard (PATCH /api/admin/orders/:name, or recording a payment). But
// the team works in Odoo, so confirming an invoice or recording a payment
// happens there and the shop never learns of it - and the customer gets no
// notification about an order whose stage genuinely changed. This loop reads
// Odoo periodically, updates the local record, and calls push.notifyOrderStage
// for whatever moved.
//
// The logic is kept apart from the script (scripts/sync-order-status.js) so it
// can be tested with a stand-in Odoo client, with no network and no server.

const DONE_STAGES = new Set(['done', 'cancelled']);

/**
 * Odoo invoice state -> local record fields.
 *
 * `state` on account.move is draft | posted | cancel. Payment in modern Odoo is
 * a separate field (`payment_state`), which is why `state` alone is not enough -
 * reading only it would have left every paid order stuck in "on its way"
 * forever.
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

/** Worth asking Odoo about: an order not finished yet that has an invoice there. */
function needsCheck(order, stageOf) {
  return Boolean(order?.odooInvoiceId) && !DONE_STAGES.has(stageOf(order));
}

/**
 * Walks the unfinished orders, asks Odoo about their invoices, and updates
 * whatever moved.
 *
 * `deps` is passed in whole so the test can run with a stand-in client:
 *   odoo    { isConfigured, readInvoice(id) → { state, paymentState } | null }
 *   orders  { listOrders, updateOrder }
 *   push    { notifyOrderStage, stageOf }
 *
 * Never throws: a failure on one order (a deleted invoice, a network drop)
 * must not stop the rest, so the cron job does not fall silent over one bad
 * record.
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

    // The timestamp is written only on the move to paid, and never touched after.
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
