/**
 * الكتالوج — مصدر المنتجات وذاكرتها المؤقّتة.
 *
 * كانت هذه الدوال في src/server.js مع `let productCache` بجوارها. وحين خرجت
 * مسارات الإدارة إلى ملفها، بقي فيها ثلاثة إسنادات إلى productCache وهو ليس
 * في نطاقها — فرمت ReferenceError وردّت 502: حفظ إعداد أودو، ومسحه،
 * والمزامنة اليدوية.
 *
 * الدرس: ذاكرة الكتالوج ليست شأن خادم HTTP. فصار لها مالك، وإبطالها
 * عملية مُسمّاة (invalidate) لا إسناداً إلى متغيّر في ملفٍ آخر.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const odoo = require('./odoo');
const productOverrides = require('./productOverrides');
const odooStatus = require('./odooStatus');
const { isOfferable } = require('./sellable');

const DEMO_PRODUCTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'demo-products.json'), 'utf8')
);

// تُخزّن منتجات أودو برهةً كي لا يرهق التصفّح نظام المؤسسة.
let productCache = { data: null, at: 0 };
const CACHE_TTL_MS = 60_000;

/** يُبطل الذاكرة — يُنادى حين يتغيّر مصدر المنتجات أو يُطلب جلبٌ طازج. */
function invalidate() {
  productCache = { data: null, at: 0 };
}

/**
 * Icons, a description override, an image override, and enabled/disabled
 * are admin-set metadata, stored separately from the product itself (see
 * src/lib/productOverrides.js) so they survive an Odoo re-sync — Odoo owns
 * name/price/stock and overwrites those every sync, but never touches
 * these.
 *
 * `enabled` is left on every product here (never filtered) — callers decide:
 * the public catalogue hides disabled products, the admin catalogue needs to
 * keep seeing them or a disabled product could never be re-enabled.
 */
async function withOverrides(products) {
  const all = await productOverrides.getAllOverrides();
  return products.map((p) => {
    const o = all[String(p.id)];
    if (!o) return { ...p, iconFeatures: [], enabled: true };
    return {
      ...p,
      iconFeatures: o.iconKeys,
      description: o.description || p.description,
      enabled: o.enabled,
      image: o.imageUrl || p.image,
    };
  });
}

async function getProducts() {
  if (!odoo.isConfigured()) {
    return { source: 'demo', products: await withOverrides(DEMO_PRODUCTS) };
  }
  if (productCache.data && Date.now() - productCache.at < CACHE_TTL_MS) {
    return { source: 'odoo', products: await withOverrides(productCache.data) };
  }

  try {
    const products = await odoo.fetchProducts();
    productCache = { data: products, at: Date.now() };
    odooStatus.clear();
    return { source: 'odoo', products: await withOverrides(products) };
  } catch (err) {
    odooStatus.record(err);
    console.error('[Odoo] fetch failed:', err.message);

    // Serve the last good Odoo data rather than taking the shop down over a
    // temporary outage or a mistyped setting. Never fall back to the demo
    // catalogue here — those are placeholder prices, and quoting them as if
    // they were real is worse than showing an error.
    if (productCache.data) {
      return { source: 'odoo', products: await withOverrides(productCache.data), stale: true };
    }
    throw err;
  }
}

/**
 * The public catalogue never lists a product an admin has switched off, nor
 * one Odoo never priced — see src/lib/sellable.js. Hiding is only half of
 * it: validateOrder checks the same predicate against the *unfiltered*
 * catalogue, because an id that has left this list is still orderable from
 * a cached app or a hand-made request.
 */
function visibleOnly(products) {
  return products.filter((p) => p.enabled !== false && isOfferable(p));
}

/**
 * A product with size/height options (see src/lib/odoo.js) is one card
 * carrying several sellable ids in `variants` — the card's own `id` is only
 * one of them. Order validation and pricing need every real id reachable,
 * so this indexes the card *and* each of its variants (inheriting the
 * card's name/category/enabled/etc, with the variant's own price/sku/stock).
 */
function productLookup(products) {
  const byId = new Map();
  for (const p of products) {
    byId.set(p.id, p);
    for (const v of p.variants ?? []) {
      byId.set(v.id, { ...p, ...v, variants: undefined });
    }
  }
  return byId;
}

module.exports = { getProducts, withOverrides, visibleOnly, productLookup, invalidate };
