// Odoo JSON-RPC client for product and order management.
// Configure: ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY
// Runs in demo mode if not configured.

const ODOO_URL = process.env.ODOO_URL || '';
const ODOO_DB = process.env.ODOO_DB || '';
const ODOO_USERNAME = process.env.ODOO_USERNAME || '';
const ODOO_API_KEY = process.env.ODOO_API_KEY || '';

function isConfigured() {
  return Boolean(ODOO_URL && ODOO_DB && ODOO_USERNAME && ODOO_API_KEY);
}

async function jsonRpc(method, params) {
  if (!isConfigured()) {
    throw new Error('Odoo not configured');
  }

  const url = `${ODOO_URL}/jsonrpc`;
  const payload = {
    jsonrpc: '2.0',
    method,
    params,
    id: Math.random(),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.data?.message || data.error.message);
    }

    return data.result;
  } catch (err) {
    console.error('[Odoo RPC Error]:', err.message);
    throw err;
  }
}

async function fetchProducts() {
  const result = await jsonRpc('call', {
    service: 'object',
    method: 'execute_kw',
    args: [
      ODOO_DB,
      2,
      ODOO_API_KEY,
      'product.product',
      'search_read',
      [['sale_ok', '=', true]],
      { fields: ['id', 'name', 'list_price', 'default_code'], limit: 100 }
    ]
  });

  return result.map(p => ({
    id: p.id,
    name: p.name,
    price: p.list_price,
    sku: p.default_code || ''
  }));
}

async function fetchProductImage(productId) {
  const result = await jsonRpc('call', {
    service: 'object',
    method: 'execute_kw',
    args: [
      ODOO_DB,
      2,
      ODOO_API_KEY,
      'product.product',
      'read',
      [productId],
      { fields: ['image_1920'] }
    ]
  });

  if (!result || !result[0]?.image_1920) {
    return null;
  }

  return Buffer.from(result[0].image_1920, 'base64');
}

async function createSaleOrder(customer, items, note) {
  const lineData = items.map(item => ({
    product_id: item.productId,
    product_uom_qty: item.quantity
  }));

  const orderData = {
    partner_id: ODOO_DB,
    order_line: [[0, 0, ...lineData]]
  };

  const orderId = await jsonRpc('call', {
    service: 'object',
    method: 'execute_kw',
    args: [
      ODOO_DB,
      2,
      ODOO_API_KEY,
      'sale.order',
      'create',
      [orderData]
    ]
  });

  const order = await jsonRpc('call', {
    service: 'object',
    method: 'execute_kw',
    args: [
      ODOO_DB,
      2,
      ODOO_API_KEY,
      'sale.order',
      'read',
      [orderId],
      { fields: ['id', 'name', 'amount_total'] }
    ]
  });

  return {
    id: order[0].id,
    name: order[0].name,
    total: order[0].amount_total,
    invoiceId: null,
    invoiceName: null,
    invoiceDate: null,
    invoiceStatus: 'draft'
  };
}

async function getInvoiceStatus(invoiceId) {
  const result = await jsonRpc('call', {
    service: 'object',
    method: 'execute_kw',
    args: [
      ODOO_DB,
      2,
      ODOO_API_KEY,
      'account.move',
      'read',
      [invoiceId],
      { fields: ['id', 'name', 'state', 'amount_total', 'create_date'] }
    ]
  });

  if (!result || !result[0]) {
    return null;
  }

  const inv = result[0];
  return {
    invoiceName: inv.name,
    status: inv.state === 'posted' ? 'posted' : inv.state === 'paid' ? 'paid' : 'draft',
    amount: inv.amount_total,
    createdAt: inv.create_date
  };
}

async function recordPayment(invoiceId, amount) {
  await jsonRpc('call', {
    service: 'object',
    method: 'execute_kw',
    args: [
      ODOO_DB,
      2,
      ODOO_API_KEY,
      'account.payment',
      'create',
      [{
        invoice_ids: [[6, 0, [invoiceId]]],
        amount: amount,
        payment_type: 'inbound'
      }]
    ]
  });

  return {
    recordedAt: new Date().toISOString()
  };
}

module.exports = {
  isConfigured,
  fetchProducts,
  fetchProductImage,
  createSaleOrder,
  getInvoiceStatus,
  recordPayment
};
