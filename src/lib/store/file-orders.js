// File-backed order history (JSONL). Used when DATABASE_URL is not set —
// see src/lib/orders.js, which picks this or store/pg-orders.js.

const fs = require('fs');
const path = require('path');

const ORDERS_LOG = path.join(__dirname, '..', '..', 'data', 'orders.local.jsonl');

function readAll() {
  try {
    return fs
      .readFileSync(ORDERS_LOG, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      // Records written before the orders module existed used `receivedAt`
      // instead of `placedAt` — keep them readable without rewriting the file.
      .map((o) => (o.placedAt ? o : { ...o, placedAt: o.receivedAt }));
  } catch {
    return [];
  }
}

function writeAll(orders) {
  fs.writeFileSync(
    ORDERS_LOG,
    orders.length ? orders.map((o) => JSON.stringify(o)).join('\n') + '\n' : ''
  );
}

async function createOrder(record) {
  const orders = readAll();
  orders.push(record);
  writeAll(orders);
  return record;
}

async function listOrders({ status, search, limit } = {}) {
  let orders = readAll().reverse();

  if (status && status !== 'all') {
    orders = orders.filter((o) =>
      status === 'paid' ? o.paymentStatus === 'paid' : o.paymentStatus !== 'paid'
    );
  }
  if (search) {
    const q = search.toLowerCase();
    orders = orders.filter((o) =>
      [o.orderName, o.invoiceName, o.customer?.name, o.customer?.phone, o.customer?.city].some(
        (v) => String(v || '').toLowerCase().includes(q)
      )
    );
  }
  return typeof limit === 'number' ? orders.slice(0, limit) : orders;
}

async function listOrdersForUser(userId) {
  return readAll()
    .filter((o) => o.userId === userId)
    .sort((a, b) => String(b.placedAt).localeCompare(String(a.placedAt)));
}

async function getOrderByName(orderName) {
  return readAll().find((o) => o.orderName === orderName) || null;
}

async function getOrderByInvoiceName(invoiceName) {
  return readAll().find((o) => o.invoiceName === invoiceName) || null;
}

/**
 * The order placed by a given checkout attempt, or null if it never landed.
 * Backs the idempotency check in POST /api/orders — see the Postgres twin for
 * the unique index that makes the same guarantee under concurrency.
 */
async function getOrderByRequestId(requestId) {
  if (!requestId) return null;
  return readAll().find((o) => o.requestId === requestId) || null;
}

async function updateOrder(orderName, updates) {
  const orders = readAll();
  const idx = orders.findIndex((o) => o.orderName === orderName);
  if (idx === -1) return null;

  orders[idx] = { ...orders[idx], ...updates, updatedAt: new Date().toISOString() };
  writeAll(orders);
  return orders[idx];
}

/**
 * A deleted account's orders lose who placed them: the account link, and the
 * name, phone and address in the order's copy here - only the city stays, for
 * the panel's figures, with the products, amounts and order number. The
 * official record - the customer, the order and its invoice - stays in Odoo,
 * which is never touched from here. Orders from before accounts carry no link,
 * so the proved phone number finds those too.
 */
async function forgetCustomer(userId, phone) {
  const orders = readAll();
  let touched = 0;
  const next = orders.map((o) => {
    const mine = o.userId === userId || (!o.userId && phone && o.customer?.phone === phone);
    if (!mine) return o;
    touched += 1;
    const { userId: _drop, ...rest } = o;
    return { ...rest, customer: { city: o.customer?.city || null } };
  });
  if (touched) writeAll(next);
  return touched;
}

module.exports = {
  createOrder,
  listOrders,
  listOrdersForUser,
  getOrderByName,
  getOrderByInvoiceName,
  getOrderByRequestId,
  updateOrder,
  forgetCustomer,
};
