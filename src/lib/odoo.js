// Odoo JSON-RPC client for product and order management.
//
// Credentials come from the dashboard (src/lib/settings.js), falling back to
// ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_API_KEY in the environment.
// Runs in demo mode when nothing is configured.

const settings = require('./settings');
const http = require('./http');
const { isSellable } = require('./sellable');

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
    const data = await http.postJson(url, payload);
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
  // What the shop would list: the products filed under Mattresses.
  const shop = await fetchShopCategories();
  const productCount = shop
    ? await jsonRpc('call', {
        service: 'object',
        method: 'execute_kw',
        args: [c.db, uid, c.apiKey, 'product.template', 'search_count', [[['categ_id', 'child_of', shop.rootId]]]],
      })
    : 0;

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

/** The Odoo product category the shop sells from; its children are the tiers. */
const SHOP_CATEGORY = 'Mattresses';

/**
 * The tiers under Mattresses, by their Odoo name: the Arabic name the shop
 * shows, and the order they are listed in (cheapest first). A tier added in
 * Odoo later still shows - under its Odoo name, after these.
 */
const TIERS = {
  economy: { name: 'اقتصادية', rank: 1 },
  comfort: { name: 'كومفورت', rank: 2 },
  premium: { name: 'بريميوم', rank: 3 },
  elite: { name: 'إيليت', rank: 4 },
};

/**
 * The Mattresses category and its children, as { rootId, tierByCategoryId }.
 * Null when Odoo has no such category - the shop then shows nothing rather
 * than every sellable record in the ERP (chemicals and labour included).
 */
async function fetchShopCategories() {
  const roots = await call('product.category', 'search_read', [[['name', '=', SHOP_CATEGORY], ['parent_id', '=', false]]], {
    fields: ['id'],
    limit: 1,
  });
  if (!roots[0]) return null;
  const rootId = roots[0].id;
  const children = await call('product.category', 'search_read', [[['parent_id', '=', rootId]]], { fields: ['id', 'name'] });
  const tierByCategoryId = new Map();
  for (const c of children) {
    const key = String(c.name).trim().toLowerCase();
    const known = TIERS[key];
    tierByCategoryId.set(c.id, { key, name: known ? known.name : String(c.name).trim(), rank: known ? known.rank : 99 });
  }
  return { rootId, tierByCategoryId };
}

/**
 * A mattress in Odoo is a product template with one or more variants (size,
 * height, ...) — this used to fetch product.product directly, which is the
 * *variant* table, so every size of every mattress showed up as its own
 * product card. Grouped here into one card per template, each carrying its
 * variants for the size picker on the product page.
 *
 * Only what Odoo files under Mattresses is the shop's - the owner's rule:
 * these categories and nothing else are synced, whatever else Odoo marks as
 * sellable (the old "مراتب 1" and topper records included). Filing a product
 * there is what puts it on sale, so "Can be Sold" is not asked for; a product
 * with no price still stays off the shop (src/lib/sellable.js). Each card
 * carries its tier - the subcategory it sits in (Economy, Comfort, Premium,
 * Elite) - which the website and the app show as their categories.
 */
async function fetchProducts() {
  const shop = await fetchShopCategories();
  if (!shop) return [];
  const templates = await searchReadAll(
    'product.template',
    [['categ_id', 'child_of', shop.rootId]],
    { fields: ['id', 'name', 'categ_id', 'product_variant_ids'] }
  );
  if (templates.length === 0) return [];

  const variantIds = templates.flatMap((t) => t.product_variant_ids);
  const variants = await readInBatches('product.product', variantIds, {
    fields: ['id', 'default_code', 'lst_price', 'qty_available', 'product_template_attribute_value_ids'],
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
        // lst_price, not list_price: the variant's own price, attribute extras included.
        price: v.lst_price,
        stock: typeof v.qty_available === 'number' ? v.qty_available : null,
        inStock: typeof v.qty_available === 'number' ? v.qty_available > 0 : true,
      });
    }
  }

  return templates.map((t) => {
    // A size Odoo has not priced yet is left out of the picker (it could not
    // be ordered anyway - see src/lib/sellable.js), so a mattress being priced
    // one size at a time shows the sizes that are ready.
    const all = variantsByTemplateId.get(t.id);
    const priced = all.filter(isSellable);
    const vs = priced.length > 0 ? priced : all;
    // The first priced variant (Odoo's own product_variant_ids order) is the
    // card's identity — fixed regardless of stock, so admin overrides (keyed
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
      // Null for a product filed under Mattresses itself rather than a tier.
      tier: shop.tierByCategoryId.get(Array.isArray(t.categ_id) ? t.categ_id[0] : t.categ_id) ?? null,
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

/** default_code of the service product every voucher discount line uses. */
const DISCOUNT_CODE = 'BRX-DISCOUNT';
let discountProductId = null;

/**
 * The "voucher discount" product, created on first use. A sale order line
 * needs a product; a dedicated service product keeps discounts readable on
 * the order and the invoice, and out of stock and purchasing. No taxes: none
 * of the shop's sale lines carry any.
 */
async function getDiscountProductId() {
  if (discountProductId) return discountProductId;
  const found = await call('product.product', 'search', [[['default_code', '=', DISCOUNT_CODE]]], { limit: 1 });
  discountProductId = found[0]
    ? found[0]
    : await call('product.product', 'create', [
        {
          name: 'خصم قسيمة',
          default_code: DISCOUNT_CODE,
          type: 'service',
          sale_ok: true,
          purchase_ok: false,
          list_price: 0,
          taxes_id: [[6, 0, []]],
        },
      ]);
  return discountProductId;
}

/**
 * Creates the sale order. `discount` ({ amount, label }) adds one negative
 * line for a voucher - in the same create call as the products, so an order
 * never exists without the discount it was placed with.
 */
async function createSaleOrder(customer, items, note, discount = null) {
  const partnerId = await findOrCreatePartner(customer);

  // Odoo one2many syntax: one [0, 0, values] tuple per line. These used to be
  // spread into a single tuple, collapsing every item into one malformed line.
  const orderLines = items.map((item) => [
    0,
    0,
    { product_id: item.productId, product_uom_qty: item.quantity },
  ]);
  if (discount && discount.amount > 0) {
    orderLines.push([
      0,
      0,
      {
        product_id: await getDiscountProductId(),
        name: discount.label,
        product_uom_qty: 1,
        price_unit: -discount.amount,
        tax_ids: [[6, 0, []]], // Odoo 19's field name (was tax_id); shop lines carry no taxes
      },
    ]);
  }

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

/**
 * The invoice's raw state: in Odoo, confirming it and paying it are separate.
 *
 * `state` is one of draft | posted | cancel, and payment lives in
 * `payment_state` (not_paid | in_payment | partial | paid | reversed).
 * getInvoiceStatus above reads `state` alone and expects 'paid' in it - a value
 * modern Odoo never returns, so it cannot tell that an order was delivered and
 * paid. This one is used by the status sync (src/lib/orderSync.js) and returns
 * the values untouched, without interpreting them.
 *
 * `payment_state` does not exist in older versions, so the read is retried
 * without that field rather than letting the whole sync fail.
 */
async function readInvoice(invoiceId) {
  let rows;
  try {
    rows = await call('account.move', 'read', [[invoiceId]], {
      fields: ['id', 'name', 'state', 'payment_state'],
    });
  } catch {
    rows = await call('account.move', 'read', [[invoiceId]], {
      fields: ['id', 'name', 'state'],
    });
  }

  const inv = rows?.[0];
  if (!inv) return null;
  return {
    id: inv.id,
    invoiceName: inv.name,
    state: inv.state || '',
    paymentState: inv.payment_state || '',
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

/* ---------------------------------------------------------------- helpdesk */

// Keyed by url+db so switching databases from the dashboard doesn't reuse a
// team id that belongs to the old one.
let supportTeamCache = null;

/**
 * The Helpdesk team customer-care tickets go to: the one named Customer Care,
 * else the first active team. Odoo's own public ticket form would need the
 * Website and Website Helpdesk apps, which this database does not have — so the
 * store's form creates tickets here directly instead.
 */
async function findSupportTeam() {
  const c = config();
  const key = `${c.url}|${c.db}`;
  if (supportTeamCache?.key === key) return supportTeamCache.id;

  const teams = await call('helpdesk.team', 'search_read', [[['active', '=', true]]], {
    fields: ['id', 'name'],
    order: 'id asc',
  });
  const team = teams.find((t) => /customer\s*care|خدمة\s*العملاء/i.test(t.name)) || teams[0];
  if (!team) throw new Error('لا يوجد فريق دعم نشط في أودو');

  supportTeamCache = { key, id: team.id };
  return team.id;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Opens a Helpdesk ticket for a website visitor. The customer is matched by
 * phone the same way orders are, so their tickets and orders sit on one partner.
 * `description` is an HTML field — everything the visitor typed is escaped.
 *
 * Returns the ticket's reference as shown in Odoo (ticket_ref), falling back to
 * the id when the reference can't be read back.
 */
async function createHelpdeskTicket({ name, phone, email, subject, message, orderName }) {
  const [partnerId, teamId] = await Promise.all([
    findOrCreatePartner({ name, phone, email }),
    findSupportTeam(),
  ]);

  const paragraphs = [
    message,
    orderName ? `رقم الطلب: ${orderName}` : null,
    'المصدر: نموذج خدمة العملاء في الموقع',
  ].filter(Boolean);
  const description = paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');

  const id = await call('helpdesk.ticket', 'create', [
    {
      name: subject,
      description,
      team_id: teamId,
      partner_id: partnerId,
      partner_name: name,
      partner_phone: phone,
      partner_email: email || false,
    },
  ]);

  let ref = null;
  try {
    const [row] = await call('helpdesk.ticket', 'read', [[id]], { fields: ['ticket_ref'] });
    ref = row?.ticket_ref || null;
  } catch {
    // The ticket exists; a missing reference only costs the customer a nicer number.
  }
  return { id, ref: ref || String(id) };
}

module.exports = {
  isConfigured,
  testConnection,
  fetchProducts,
  fetchProductImage,
  createSaleOrder,
  getInvoiceStatus,
  readInvoice,
  recordPayment,
  createHelpdeskTicket,
};
