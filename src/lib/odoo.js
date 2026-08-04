// Odoo JSON-RPC client for product and order management.
//
// Credentials come from the dashboard (src/lib/settings.js), falling back to
// ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_API_KEY in the environment.
// Runs in demo mode when nothing is configured.

const settings = require('./settings');

// Read per call rather than captured at boot, so saving settings from the
// dashboard takes effect without a restart.
function config() {
  return settings.getOdoo();
}

function isConfigured() {
  const c = config();
  return Boolean(c.url && c.db && c.username && c.apiKey);
}

async function jsonRpc(method, params) {
  if (!isConfigured()) {
    throw new Error('Odoo not configured');
  }

  const url = `${config().url}/jsonrpc`;
  const payload = { jsonrpc: '2.0', method, params, id: Math.random() };

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

/**
 * Exchanges the credentials for a user id.
 *
 * Every call below needs one. It used to be hard-coded to 2, which happens to
 * be the admin on a fresh database and is wrong everywhere else. The id is
 * cached in settings after the first successful authentication.
 */
async function authenticate() {
  const c = config();
  const uid = await jsonRpc('call', {
    service: 'common',
    method: 'login',
    args: [c.db, c.username, c.apiKey],
  });

  if (!uid || typeof uid !== 'number') {
    throw new Error('فشل التحقق من بيانات أودو — راجع قاعدة البيانات واسم المستخدم والمفتاح');
  }
  return uid;
}

/** The cached uid, authenticating once if it is not known yet. */
async function currentUid() {
  const c = config();
  if (typeof c.uid === 'number') return c.uid;

  const uid = await authenticate();
  settings.saveOdoo({ ...c, uid });
  return uid;
}

/** execute_kw with the database, uid and key filled in. */
async function call(model, method, args, kwargs) {
  const c = config();
  const uid = await currentUid();
  return jsonRpc('call', {
    service: 'object',
    method: 'execute_kw',
    args: [c.db, uid, c.apiKey, model, method, args, ...(kwargs ? [kwargs] : [])],
  });
}

/** Verifies the settings end to end and reports what it found. */
async function testConnection() {
  const uid = await authenticate();
  const version = await jsonRpc('call', { service: 'common', method: 'version', args: [] });
  const c = config();
  const productCount = await jsonRpc('call', {
    service: 'object',
    method: 'execute_kw',
    args: [c.db, uid, c.apiKey, 'product.product', 'search_count', [[['sale_ok', '=', true]]]],
  });

  settings.saveOdoo({ ...c, uid });
  return {
    uid,
    serverVersion: version?.server_version || null,
    productCount: typeof productCount === 'number' ? productCount : null,
  };
}

// One page/batch at a time rather than a single unbounded call — a catalog
// this size is fine in a handful of round trips, and it caps how much a
// runaway catalog could ever demand in one request.
const PAGE_SIZE = 200;

async function searchReadAll(model, domain, kwargs) {
  const result = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await call(model, 'search_read', [domain], { ...kwargs, limit: PAGE_SIZE, offset });
    result.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return result;
}

async function readInBatches(model, ids, kwargs) {
  const result = [];
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const batch = await call(model, 'read', [ids.slice(i, i + PAGE_SIZE)], kwargs);
    result.push(...batch);
  }
  return result;
}

/**
 * A mattress in Odoo is a product template with one or more variants (size,
 * height, ...) — this used to fetch product.product directly, which is the
 * *variant* table, so every size of every mattress showed up as its own
 * product card. Grouped here into one card per template, each carrying its
 * variants for the size picker on the product page.
 */
async function fetchProducts() {
  const templates = await searchReadAll('product.template', [['sale_ok', '=', true]], {
    fields: ['id', 'name', 'product_variant_ids'],
  });
  if (templates.length === 0) return [];

  const variantIds = templates.flatMap((t) => t.product_variant_ids);
  const variants = await readInBatches('product.product', variantIds, {
    fields: ['id', 'default_code', 'list_price', 'qty_available', 'product_template_attribute_value_ids'],
  });

  const ptavIds = [...new Set(variants.flatMap((v) => v.product_template_attribute_value_ids))];
  const ptavNameById = new Map();
  if (ptavIds.length > 0) {
    const ptavs = await readInBatches('product.template.attribute.value', ptavIds, { fields: ['id', 'name'] });
    for (const p of ptavs) ptavNameById.set(p.id, p.name);
  }

  const variantsByTemplateId = new Map();
  for (const t of templates) variantsByTemplateId.set(t.id, []);
  const variantById = new Map(variants.map((v) => [v.id, v]));
  for (const t of templates) {
    for (const vid of t.product_variant_ids) {
      const v = variantById.get(vid);
      if (!v) continue;
      variantsByTemplateId.get(t.id).push({
        id: v.id,
        // Falls back to the raw ids when a value's name didn't come back —
        // still a usable (if ugly) label rather than a blank option.
        label: v.product_template_attribute_value_ids.map((id) => ptavNameById.get(id) || id).join(' / '),
        sku: v.default_code || '',
        price: v.list_price,
        stock: typeof v.qty_available === 'number' ? v.qty_available : null,
        inStock: typeof v.qty_available === 'number' ? v.qty_available > 0 : true,
      });
    }
  }

  return templates.map((t) => {
    const vs = variantsByTemplateId.get(t.id);
    // The first variant (Odoo's own product_variant_ids order) is the card's
    // stable identity — fixed regardless of stock, so admin overrides (keyed
    // by this id) and cart/order lookups don't shift between fetches.
    const primary = vs[0];
    return {
      id: primary.id,
      name: t.name,
      price: primary.price,
      sku: primary.sku,
      stock: primary.stock,
      inStock: vs.some((v) => v.inStock),
      // The whole Odoo catalogue is mattresses today — Odoo has no notion of
      // the site's mattress/pillow/bedding split, so this is a fixed default
      // rather than something read from a field. Revisit if pillows/bedding
      // ever get added to Odoo.
      category: 'mattress',
      // A single-variant template (or one with no attributes at all) has
      // nothing to pick between, so no size selector is needed for it.
      variants: vs.length > 1 ? vs : undefined,
    };
  });
}

async function fetchProductImage(productId) {
  const result = await call('product.product', 'read', [[productId]], { fields: ['image_1920'] });

  if (!result || !result[0]?.image_1920) {
    return null;
  }
  return Buffer.from(result[0].image_1920, 'base64');
}

/**
 * Finds an existing partner by phone, or creates one.
 *
 * The order previously set partner_id to the database name, which is not a
 * partner id at all — orders could never have been created against a real Odoo.
 */
async function findOrCreatePartner(customer) {
  const phone = String(customer.phone || '').trim();

  if (phone) {
    const existing = await call(
      'res.partner',
      'search_read',
      [[['phone', '=', phone]]],
      { fields: ['id'], limit: 1 }
    );
    if (existing?.[0]?.id) return existing[0].id;
  }

  return call('res.partner', 'create', [
    {
      name: String(customer.name || '').trim() || 'عميل',
      phone,
      email: customer.email ? String(customer.email).trim() : false,
      city: String(customer.city || '').trim() || false,
      street: String(customer.address || '').trim() || false,
    },
  ]);
}

async function createSaleOrder(customer, items, note) {
  const partnerId = await findOrCreatePartner(customer);

  // Odoo one2many syntax: one [0, 0, values] tuple per line. These used to be
  // spread into a single tuple, collapsing every item into one malformed line.
  const orderLines = items.map((item) => [
    0,
    0,
    { product_id: item.productId, product_uom_qty: item.quantity },
  ]);

  const orderId = await call('sale.order', 'create', [
    {
      partner_id: partnerId,
      order_line: orderLines,
      note: note ? String(note) : false,
    },
  ]);

  const order = await call('sale.order', 'read', [[orderId]], {
    fields: ['id', 'name', 'amount_total'],
  });

  return {
    id: order[0].id,
    name: order[0].name,
    total: order[0].amount_total,
    partnerId,
    invoiceId: null,
    invoiceName: null,
    invoiceDate: null,
    invoiceStatus: 'draft',
  };
}

async function getInvoiceStatus(invoiceId) {
  const result = await call('account.move', 'read', [[invoiceId]], {
    fields: ['id', 'name', 'state', 'amount_total', 'create_date'],
  });

  if (!result || !result[0]) {
    return null;
  }

  const inv = result[0];
  return {
    invoiceName: inv.name,
    status: inv.state === 'posted' ? 'posted' : inv.state === 'paid' ? 'paid' : 'draft',
    amount: inv.amount_total,
    createdAt: inv.create_date,
  };
}

async function recordPayment(invoiceId, amount) {
  await call('account.payment', 'create', [
    {
      invoice_ids: [[6, 0, [invoiceId]]],
      amount,
      payment_type: 'inbound',
    },
  ]);

  return { recordedAt: new Date().toISOString() };
}

module.exports = {
  isConfigured,
  testConnection,
  fetchProducts,
  fetchProductImage,
  createSaleOrder,
  getInvoiceStatus,
  recordPayment,
};
