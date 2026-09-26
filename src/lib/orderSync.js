// Syncing order stages from Odoo - and sending notifications from there.
//
// Why it exists: a notification only went out when the stage changed from the
// shop's dashboard (PATCH /api/admin/orders/:name, or recording a payment). But
// the team works in Odoo, so confirming an order, sending it out or recording
// a payment happens there and the shop never learns of it - and the customer
// gets no notification about an order whose stage genuinely changed. This
// loop reads Odoo periodically, updates the local record, and calls
// push.notifyOrderStage for whatever moved.
//
// It follows the sale order itself. It used to follow the order's invoice,
// but the shop never knows that invoice: the team makes it in Odoo after the
// order arrives, so no website or app order was ever checked. The invoice path
// is kept for old records that carry an invoice id and no order id.
//
// The logic is kept apart from the script (scripts/sync-order-status.js) so it
// can be tested with a stand-in Odoo client, with no network and no server.

const DONE_STAGES = new Set(['done', 'cancelled']);

// A payment recorded on the invoice: `in_payment` is a payment waiting for
// its bank match - the customer has paid all the same.
const PAID = new Set(['paid', 'in_payment']);

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

/**
 * The customer's stage from the sale order in Odoo, following how the team
 * works: confirming the order ("we start preparing it"), validating its
 * delivery when it leaves the warehouse ("on its way"), recording the
 * payment on the invoice when the driver brings the cash ("delivered").
 */
function stageFromOrder(p) {
  if (!p) return null;
  if (p.state === 'cancel') return 'cancelled';
  if (p.invoice?.state === 'posted' && PAID.has(p.invoice.paymentState)) return 'done';
  if (p.deliveryStatus === 'partial' || p.deliveryStatus === 'full') return 'shipping';
  if (p.state === 'sale') return 'confirmed';
  return 'review';
}

// Each stage in the record's own fields, as the app reads them
// (src/features/orderStatus.ts there, push.stageOf here).
const INVOICE_STATUS = {
  review: 'draft',
  confirmed: 'confirmed',
  shipping: 'posted',
  done: 'posted',
  cancelled: 'cancel',
};

/** Odoo sale order progress -> local record fields. */
function updatesFromOrder(p) {
  const stage = stageFromOrder(p);
  if (!stage) return null;
  const updates = {
    invoiceStatus: INVOICE_STATUS[stage],
    paymentStatus: stage === 'done' ? 'paid' : 'unpaid',
  };
  // The invoice's number once it has one - a draft is still "/" or empty.
  if (p.invoice?.name && p.invoice.name !== '/') {
    updates.odooInvoiceId = p.invoice.id;
    updates.invoiceName = p.invoice.name;
  }
  return updates;
}

/** Worth asking Odoo about: an order not finished yet that Odoo knows. */
function needsCheck(order, stageOf) {
  return Boolean(order?.odooOrderId || order?.odooInvoiceId) && !DONE_STAGES.has(stageOf(order));
}

// Pre-orders take ten days to make and a few more to deliver; past this an
// order's news is stale.
const NOTIFY_WITHIN_DAYS = 30;

function isStale(order, now = Date.now()) {
  const placed = Date.parse(order?.placedAt || order?.receivedAt || '');
  return Number.isFinite(placed) && now - placed > NOTIFY_WITHIN_DAYS * 24 * 60 * 60 * 1000;
}

/** Only the fields that actually differ - an unchanged record is not rewritten. */
function changedFields(order, updates) {
  const out = {};
  for (const [k, v] of Object.entries(updates || {})) if (order[k] !== v) out[k] = v;
  return out;
}

/**
 * Walks the unfinished orders, asks Odoo where they stand, and updates
 * whatever moved.
 *
 * `deps` is passed in whole so the test can run with a stand-in client:
 *   odoo    { isConfigured, readOrdersProgress(ids) → Map, readInvoice(id) → { state, paymentState } | null }
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
  log(`طلبات غير منتهية في أودو: ${pending.length} من ${all.length}`);

  // All the sale orders in one round trip.
  const orderIds = pending.map((o) => o.odooOrderId).filter(Boolean);
  let progress = new Map();
  let progressFailed = false;
  if (orderIds.length) {
    try {
      progress = await odoo.readOrdersProgress(orderIds);
    } catch (err) {
      progressFailed = true;
      log(`✗ تعذّر قراءة طلبات أودو — ${err.message}`);
    }
  }

  for (const order of pending) {
    summary.checked++;
    let updates;
    if (order.odooOrderId) {
      if (progressFailed) {
        summary.failed++;
        continue;
      }
      const p = progress.get(order.odooOrderId);
      if (!p) {
        summary.failed++;
        log(`✗ ${order.orderName}: الطلب ${order.odooOrderId} غير موجود في أودو`);
        continue;
      }
      updates = updatesFromOrder(p);
    } else {
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
      updates = updatesFromInvoice(inv);
    }

    updates = changedFields(order, updates);
    if (!Object.keys(updates).length) continue;

    // The timestamp is written only on the move to paid, and never touched after.
    if (updates.paymentStatus === 'paid' && !order.paidAt) {
      updates.paidAt = new Date().toISOString();
    }

    const before = order;
    const after = { ...order, ...updates };
    try {
      const saved = await orders.updateOrder(order.orderName, updates);
      summary.changed++;
      // An old order catching up (the first run after this sync began following
      // orders) is updated quietly: news about a month-old order is noise.
      const result = isStale(order)
        ? { sent: 0, reason: 'old_order' }
        : await push.notifyOrderStage(before, saved || after);
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

module.exports = { syncOrderStatuses, updatesFromInvoice, updatesFromOrder, stageFromOrder, needsCheck };
