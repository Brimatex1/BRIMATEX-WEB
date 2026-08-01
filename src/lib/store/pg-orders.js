// Postgres-backed order history. Used when DATABASE_URL is set — see
// src/lib/orders.js, which picks this or store/file-orders.js.

const db = require('../db');

function toOrder(row) {
  if (!row) return null;
  return {
    orderName: row.order_name,
    invoiceName: row.invoice_name,
    userId: row.user_id,
    source: row.source,
    customer: row.customer,
    items: row.items,
    note: row.note || '',
    total: Number(row.total) || 0,
    invoiceStatus: row.invoice_status,
    paymentStatus: row.payment_status,
    odooOrderId: row.odoo_order_id,
    odooInvoiceId: row.odoo_invoice_id,
    receivedAt: row.placed_at,
    placedAt: row.placed_at,
    paidAt: row.paid_at,
  };
}

async function createOrder(record) {
  const { rows } = await db.query(
    `insert into orders
       (order_name, invoice_name, user_id, source, customer, items, note, total,
        invoice_status, payment_status, odoo_order_id, odoo_invoice_id, placed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning *`,
    [
      record.orderName,
      record.invoiceName || null,
      record.userId || null,
      record.source,
      JSON.stringify(record.customer || {}),
      JSON.stringify(record.items || []),
      record.note || null,
      record.total || 0,
      record.invoiceStatus || 'draft',
      record.paymentStatus || 'unpaid',
      record.odooOrderId || null,
      record.odooInvoiceId || null,
      record.placedAt || record.receivedAt || new Date().toISOString(),
    ]
  );
  return toOrder(rows[0]);
}

async function listOrders({ status, search, limit } = {}) {
  const clauses = [];
  const params = [];

  if (status === 'paid') {
    clauses.push(`payment_status = 'paid'`);
  } else if (status && status !== 'all') {
    clauses.push(`payment_status != 'paid'`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const p = `$${params.length}`;
    clauses.push(
      `(lower(order_name) like ${p} or lower(coalesce(invoice_name, '')) like ${p} or
        lower(customer->>'name') like ${p} or lower(customer->>'phone') like ${p} or
        lower(customer->>'city') like ${p})`
    );
  }

  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limitClause = typeof limit === 'number' ? `limit ${Number(limit)}` : '';
  const { rows } = await db.query(
    `select * from orders ${where} order by placed_at desc ${limitClause}`,
    params
  );
  return rows.map(toOrder);
}

async function listOrdersForUser(userId) {
  const { rows } = await db.query(
    'select * from orders where user_id = $1 order by placed_at desc',
    [userId]
  );
  return rows.map(toOrder);
}

async function getOrderByName(orderName) {
  const { rows } = await db.query('select * from orders where order_name = $1', [orderName]);
  return toOrder(rows[0]);
}

async function getOrderByInvoiceName(invoiceName) {
  const { rows } = await db.query('select * from orders where invoice_name = $1', [invoiceName]);
  return toOrder(rows[0]);
}

const UPDATABLE_COLUMNS = {
  paymentStatus: 'payment_status',
  invoiceStatus: 'invoice_status',
  paidAt: 'paid_at',
  odooOrderId: 'odoo_order_id',
  odooInvoiceId: 'odoo_invoice_id',
  invoiceName: 'invoice_name',
};

async function updateOrder(orderName, updates) {
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (updates[key] === undefined) continue;
    params.push(updates[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) return getOrderByName(orderName);

  sets.push('updated_at = now()');
  params.push(orderName);
  const { rows } = await db.query(
    `update orders set ${sets.join(', ')} where order_name = $${params.length} returning *`,
    params
  );
  return toOrder(rows[0]);
}

module.exports = {
  createOrder,
  listOrders,
  listOrdersForUser,
  getOrderByName,
  getOrderByInvoiceName,
  updateOrder,
};
