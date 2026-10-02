/**
 * «المراتب» in the admin panel (/admin/products) - the eight catalogue
 * mattresses, and the two places what a customer sees of one comes from:
 *
 *   ما يظهر في المتجر   the shop's own record per product (src/lib/productOverrides.js):
 *                       the photo the website and the apps show, the website's
 *                       feature icons, the description, shown or hidden. This is
 *                       what customers see today - Odoo's pictures are switched
 *                       off (src/lib/catalogue.js) and its descriptions are not read.
 *   في أودو            the product (template) itself: image_1920, the native
 *                       product tags (product_tag_ids) and description_sale -
 *                       written to Odoo only when the panel saves.
 *
 * Price, sizes, stock and warranty are Odoo's (the warranty the printed
 * catalogue's) and are read-only here, with a link to the record in Odoo.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const odoo = require('./odoo');
const productOverrides = require('./productOverrides');
const { getProducts } = require('./catalogue');
const { detailsFor } = require('./productDetails');
const { photoFor } = require('./productPhotos');
const { sniff } = require('./avatar');

/**
 * The catalogue's eight (the handoff's docs/PRODUCTS.md), by their Odoo product
 * (template) ids - the same ids the shipped photos and details use. كراون is
 * not in the shop's categories yet, so Odoo is the only place it is read from.
 */
const CATALOGUE = [
  { key: 'crown', name: 'كراون', templateId: 4873 },
  { key: 'deluxe', name: 'ديلوكس', templateId: 4792 },
  { key: 'hotel', name: 'هوتيل', templateId: 4773 },
  { key: 'sport', name: 'سبورت', templateId: 4973 },
  { key: 'balance', name: 'بالانس', templateId: 5012 },
  { key: 'comfort', name: 'كمفورت', templateId: 4776 },
  { key: 'daily', name: 'ديلي', templateId: 4779 },
  { key: 'classic', name: 'كلاسيك', templateId: 4782 },
];

/** The website's feature icons (web/src/shop/Features.tsx - the catalogue's icon pack). */
const FEATURE_ICONS = [
  'warranty-10y', 'warranty-7y', 'warranty-6y', 'warranty-5y', 'warranty-4y', 'warranty-3y',
  'density-30', 'density-28', 'density-22',
  'pocket-springs', 'bonnell-springs', 'memory-foam', 'high-density-foam',
  'hotel-comfort-layer', 'multi-comfort-layers', 'medical-support', 'edge-support',
  'summer-winter', 'ventilation', 'deep-sleep', 'premium-quality', 'economy-price', 'made-in-libya',
];

const DESCRIPTION_MAX = 2000;
const IMAGE_MAX_BYTES = 5_000_000;
const TAG_MAX = 40;
const TAGS_PER_PRODUCT = 20;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS = '/uploads/products/';

/** The sale module's product form - Odoo 17+ addresses a record as /odoo/action-<xmlid>/<id>. */
const ODOO_FORM = '/odoo/action-sale.product_template_action/';

class PanelProductsError extends Error {
  constructor(message, { status = 400, code = 'invalid', field = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const fail = (message, field, status = 400) => {
  throw new PanelProductsError(message, { field, status });
};

/** «مرتبة كومفورت» → «كمفورت»: the catalogue's names (web/src/shop/catalog.ts displayName). */
const ALIASES = { كومفورت: 'كمفورت', دايلي: 'ديلي' };
function displayName(name) {
  const short = String(name || '').replace(/^مرتبة\s+/, '').replace(/^\[[^\]]*\]\s*مرتبة\s+/, '').trim();
  return ALIASES[short] ?? short;
}

function odooLink(templateId) {
  const base = odoo.webUrl();
  return base && templateId ? `${base}${ODOO_FORM}${templateId}` : null;
}

/** Odoo's base64 picture as something an <img> shows (Odoo keeps the uploaded format). */
function imageDataUrl(base64) {
  if (!base64 || typeof base64 !== 'string') return null;
  const head = base64.slice(0, 16);
  const mime = head.startsWith('/9j/') ? 'image/jpeg' : head.startsWith('iVBOR') ? 'image/png' : head.startsWith('UklGR') ? 'image/webp' : head.startsWith('PHN2') || head.startsWith('PD94') ? 'image/svg+xml' : 'image/png';
  return `data:${mime};base64,${base64}`;
}

function isAccessError(err) {
  return /AccessError/.test(err?.odooName || '') || /access|not allowed|صلاحي/i.test(err?.message || '');
}

/* ---------------------------------------------------------------- reading */

/** The shop's side of a product: what customers see, and what of it comes from where. */
function shopSide(product, override) {
  const variants = product.variants?.length ? product.variants : [product];
  const prices = variants.map((v) => Number(v.price)).filter((n) => n > 0);
  const stocks = variants.map((v) => v.stock).filter((n) => typeof n === 'number');
  const details = detailsFor(product);
  const shipped = photoFor(product);
  const upload = override?.imageUrl || null;
  return {
    id: product.id,
    templateId: product.templateId ?? null,
    name: product.name,
    tier: product.tier ? { key: product.tier.key, name: product.tier.name } : null,
    priceFrom: prices.length ? Math.min(...prices) : null,
    sizes: variants.length,
    stock: stocks.length ? stocks.reduce((a, b) => a + b, 0) : null,
    inStock: variants.some((v) => v.inStock !== false),
    warrantyYears: product.warrantyYears ?? null,
    enabled: product.enabled !== false,
    image: product.image || null,
    imageSource: upload ? 'upload' : shipped ? 'catalogue' : product.image ? 'odoo' : 'none',
    catalogueImage: shipped,
    description: product.description || '',
    descriptionOverride: override?.description || null,
    catalogueDescription: details.description,
    features: Array.isArray(product.featureIcons) ? product.featureIcons : [],
    featuresOverride: Array.isArray(override?.features) ? override.features : null,
    catalogueFeatures: details.features,
  };
}

/** Odoo's side: the template's own fields (null when it is not in Odoo, or Odoo is off). */
function odooSide(t, tagNames) {
  return {
    templateId: t.id,
    name: t.name,
    listPrice: typeof t.list_price === 'number' ? t.list_price : null,
    category: Array.isArray(t.categ_id) ? t.categ_id[1] : null,
    tags: (t.product_tag_ids || []).map((id) => ({ id, name: tagNames.get(id) || String(id) })),
    descriptionSale: typeof t.description_sale === 'string' ? t.description_sale : '',
    hasImage: Boolean(t.image_128),
    image: imageDataUrl(t.image_128),
    link: odooLink(t.id),
  };
}

const TEMPLATE_FIELDS = ['id', 'name', 'list_price', 'categ_id', 'product_tag_ids', 'description_sale', 'image_128'];

async function readTemplates(ids) {
  if (!ids.length) return [];
  return odoo.call('product.template', 'search_read', [[['id', 'in', ids]]], { fields: TEMPLATE_FIELDS });
}

async function readTags() {
  return odoo.call('product.tag', 'search_read', [[]], { fields: ['id', 'name'], order: 'name', limit: 500 });
}

/**
 * The page: one row per catalogue mattress (then any other product the shop
 * sells), each with its shop side and its Odoo side; Odoo's tags to choose
 * from; and whether Odoo answered.
 */
async function list() {
  let products = [];
  let source = 'demo';
  let catalogueError = null;
  try {
    const result = await getProducts();
    products = result.products || [];
    source = result.source;
  } catch (err) {
    catalogueError = err.message;
  }
  const overrides = await productOverrides.getAllOverrides();

  const odooState = { connected: odoo.isConfigured(), url: odoo.webUrl(), error: null };
  const templates = new Map();
  let tags = [];
  if (odooState.connected) {
    const ids = [...new Set([...CATALOGUE.map((c) => c.templateId), ...products.map((p) => p.templateId).filter(Number.isInteger)])];
    try {
      const [rows, tagRows] = await Promise.all([readTemplates(ids), readTags()]);
      for (const t of rows) templates.set(t.id, t);
      tags = tagRows.map((t) => ({ id: t.id, name: t.name }));
    } catch (err) {
      odooState.error = isAccessError(err) ? 'حساب الربط لا يملك صلاحية قراءة المنتجات في أودو' : `تعذّرت القراءة من أودو: ${err.message}`;
    }
  }
  const tagNames = new Map(tags.map((t) => [t.id, t.name]));

  const used = new Set();
  const rows = CATALOGUE.map((c) => {
    const product =
      products.find((p) => p.templateId === c.templateId) || products.find((p) => !used.has(p.id) && displayName(p.name) === c.name) || null;
    if (product) used.add(product.id);
    const t = templates.get(c.templateId) || (product?.templateId ? templates.get(product.templateId) : null);
    return {
      key: c.key,
      name: c.name,
      templateId: c.templateId,
      shop: product ? shopSide(product, overrides[String(product.id)]) : null,
      odoo: t ? odooSide(t, tagNames) : null,
      odooLink: odooLink(t?.id ?? c.templateId),
    };
  });
  for (const p of products) {
    if (used.has(p.id)) continue;
    const t = p.templateId ? templates.get(p.templateId) : null;
    rows.push({
      key: null,
      name: displayName(p.name),
      templateId: p.templateId ?? null,
      shop: shopSide(p, overrides[String(p.id)]),
      odoo: t ? odooSide(t, tagNames) : null,
      odooLink: odooLink(p.templateId),
    });
  }

  return { products: rows, tags, odoo: odooState, source, catalogueError, featureIcons: FEATURE_ICONS };
}

/* ---------------------------------------------------------------- the shop's side */

/** The shop's products by their card id (the key of their override) - or a 404. */
async function shopProduct(id) {
  const { products } = await getProducts();
  const product = products.find((p) => p.id === id);
  if (!product) throw new PanelProductsError('المرتبة غير موجودة في المتجر', { status: 404, code: 'missing' });
  return product;
}

/**
 * «ما يظهر في المتجر»: { description?, features?, enabled? } - only what is
 * sent changes. An empty description, or features: null, goes back to the
 * printed catalogue's.
 */
function validateShop(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('البيانات غير صالحة', null);
  const changes = {};
  if (payload.description !== undefined) {
    if (payload.description !== null && typeof payload.description !== 'string') fail('الوصف غير صالح', 'description');
    const text = (payload.description || '').trim();
    if (text.length > DESCRIPTION_MAX) fail(`الوصف أطول من ${DESCRIPTION_MAX} حرف`, 'description');
    changes.description = text || null;
  }
  if (payload.features !== undefined) {
    if (payload.features !== null) {
      if (!Array.isArray(payload.features) || payload.features.some((k) => typeof k !== 'string')) fail('قائمة المميزات غير صالحة', 'features');
      const unknown = payload.features.find((k) => !FEATURE_ICONS.includes(k));
      if (unknown) fail(`أيقونة غير معروفة: ${unknown}`, 'features');
      changes.features = [...new Set(payload.features)];
    } else {
      changes.features = null;
    }
  }
  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== 'boolean') fail('قيمة الظهور غير صالحة', 'enabled');
    changes.enabled = payload.enabled;
  }
  return changes;
}

async function saveShop(id, payload) {
  const changes = validateShop(payload);
  await shopProduct(id);
  return productOverrides.setOverridesForProduct(id, changes);
}

/** A data URL's picture as bytes and its real type (the bytes decide, not the declared type). */
function readImage(dataUrl, field) {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) fail('صيغة الصورة يجب أن تكون JPEG أو PNG أو WebP', field);
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > IMAGE_MAX_BYTES) fail('حجم الصورة يتجاوز 5 ميجابايت', field, 413);
  const ext = sniff(buffer);
  if (!ext) fail('الملف ليس صورة JPEG أو PNG أو WebP', field);
  return { buffer, ext };
}

function removeUpload(url) {
  if (!url || !url.startsWith(UPLOADS)) return;
  fs.unlink(path.join(PUBLIC_DIR, url), () => {});
}

/** The shop's photo for a product - the classic dashboard's upload, same files and names. */
async function saveShopImage(id, dataUrl) {
  const { buffer, ext } = readImage(dataUrl, 'image');
  await shopProduct(id);
  const current = await productOverrides.getOverridesForProduct(id);
  const filename = `${id}-${Date.now()}.${ext}`;
  const dir = path.join(PUBLIC_DIR, UPLOADS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  removeUpload(current.imageUrl);
  return productOverrides.setOverridesForProduct(id, { imageUrl: `${UPLOADS}${filename}` });
}

/** Drops the uploaded photo: the shop goes back to the catalogue's. */
async function removeShopImage(id) {
  await shopProduct(id);
  const current = await productOverrides.getOverridesForProduct(id);
  removeUpload(current.imageUrl);
  return productOverrides.setOverridesForProduct(id, { imageUrl: null });
}

/* ---------------------------------------------------------------- Odoo's side */

/**
 * «في أودو»: { image?, tagIds?, newTags?, descriptionSale? } → the values for
 * product.template.write. Checked whole before anything is written.
 */
function validateOdoo(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('البيانات غير صالحة', null);
  const vals = {};
  const tags = { ids: null, names: [] };
  if (payload.image !== undefined && payload.image !== null) {
    const { buffer } = readImage(payload.image, 'image');
    vals.image_1920 = buffer.toString('base64');
  }
  if (payload.tagIds !== undefined || payload.newTags !== undefined) {
    const ids = payload.tagIds ?? [];
    if (!Array.isArray(ids) || ids.some((n) => !Number.isInteger(n) || n <= 0)) fail('الوسوم غير صالحة', 'tags');
    const names = payload.newTags ?? [];
    if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) fail('الوسوم غير صالحة', 'tags');
    const clean = [...new Set(names.map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean))];
    const long = clean.find((n) => n.length > TAG_MAX);
    if (long) fail(`الوسم «${long.slice(0, 20)}…» أطول من ${TAG_MAX} حرفاً`, 'tags');
    if (new Set(ids).size + clean.length > TAGS_PER_PRODUCT) fail(`${TAGS_PER_PRODUCT} وسماً كحد أقصى للمرتبة`, 'tags');
    tags.ids = [...new Set(ids)];
    tags.names = clean;
  }
  if (payload.descriptionSale !== undefined) {
    if (payload.descriptionSale !== null && typeof payload.descriptionSale !== 'string') fail('وصف أودو غير صالح', 'descriptionSale');
    const text = (payload.descriptionSale || '').trim();
    if (text.length > DESCRIPTION_MAX) fail(`وصف أودو أطول من ${DESCRIPTION_MAX} حرف`, 'descriptionSale');
    vals.description_sale = text || false;
  }
  if (!Object.keys(vals).length && tags.ids === null) fail('لا تغييرات للحفظ في أودو', null);
  return { vals, tags };
}

function odooError(err, what) {
  if (err instanceof PanelProductsError) return err;
  if (isAccessError(err)) return new PanelProductsError(`تعذّر ${what} في أودو: حساب الربط يحتاج صلاحية المنتجات`, { status: 503, code: 'odoo_access' });
  return new PanelProductsError(`تعذّر ${what} في أودو: ${err.message}`, { status: 502, code: 'odoo' });
}

/** A tag by its name (any case), made when Odoo has none - product.tag is Odoo's own model. */
async function tagIdFor(name) {
  const [found] = await odoo.call('product.tag', 'search_read', [[['name', '=ilike', name]]], { fields: ['id'], limit: 1 });
  if (found) return found.id;
  return odoo.call('product.tag', 'create', [{ name }]);
}

/** Writes the Odoo side of one of the panel's mattresses, and answers with its row afresh. */
async function saveOdoo(templateId, payload) {
  const { vals, tags } = validateOdoo(payload);
  if (!odoo.isConfigured()) throw new PanelProductsError('أودو غير متصل، فلا يمكن الحفظ فيه الآن', { status: 503, code: 'odoo_off' });

  const page = await list();
  const row = page.products.find((r) => r.odoo?.templateId === templateId || r.templateId === templateId);
  if (!row) throw new PanelProductsError('هذه المرتبة ليست من مراتب الكتالوج', { status: 404, code: 'missing' });
  if (page.odoo.error) throw new PanelProductsError(page.odoo.error, { status: 503, code: 'odoo' });
  if (!row.odoo) throw new PanelProductsError('المرتبة غير موجودة في أودو', { status: 404, code: 'missing' });

  try {
    if (tags.ids !== null) {
      const created = [];
      for (const name of tags.names) created.push(await tagIdFor(name));
      vals.product_tag_ids = [[6, 0, [...new Set([...tags.ids, ...created])]]];
    }
    await odoo.call('product.template', 'write', [[templateId], vals]);
  } catch (err) {
    throw odooError(err, 'الحفظ');
  }
  const after = await list();
  return after.products.find((r) => r.odoo?.templateId === templateId || r.templateId === templateId) || null;
}

module.exports = {
  CATALOGUE,
  FEATURE_ICONS,
  ODOO_FORM,
  PanelProductsError,
  list,
  validateShop,
  saveShop,
  saveShopImage,
  removeShopImage,
  validateOdoo,
  saveOdoo,
  displayName,
};
