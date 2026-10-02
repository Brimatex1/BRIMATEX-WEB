/**
 * Each mattress's details from the printed catalogue - its description, spec
 * icons, warranty and layers, and the short line the app's cards show under
 * the name ("tagline": «مرتبة نوابض بوسادة علوية») - shipped with the site in
 * src/data/product-details.json and matched by the Odoo product (template)
 * id, like the photos (src/lib/productPhotos.js) - the id survives the renames
 * a name does not. Odoo holds none of this; the dashboard can still
 * set a description or icons for a product, and those win (src/lib/catalogue.js).
 */
const fs = require('fs');
const path = require('path');

const MAP_FILE = path.join(__dirname, '..', 'data', 'product-details.json');

function clean(entry) {
  return {
    description: typeof entry.description === 'string' && entry.description.trim() ? entry.description.trim() : null,
    tagline: typeof entry.tagline === 'string' && entry.tagline.trim() ? entry.tagline.trim() : null,
    iconKeys: Array.isArray(entry.iconKeys) ? entry.iconKeys.filter((k) => typeof k === 'string') : [],
    warrantyYears: Number.isInteger(entry.warrantyYears) && entry.warrantyYears > 0 ? entry.warrantyYears : null,
    layers: Array.isArray(entry.layers) ? entry.layers.filter((l) => typeof l === 'string' && l.trim()) : [],
    // The 2026 handoff (docs/PRODUCTS.md): the catalogue's feature icons, in order, and what the
    // comparison shows - its type, top layer, and frame or core density.
    features: Array.isArray(entry.features) ? entry.features.filter((k) => typeof k === 'string' && /^[a-z0-9-]+$/.test(k)) : [],
    compare: cleanCompare(entry.compare),
  };
}

function cleanCompare(c) {
  if (!c || typeof c !== 'object') return null;
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const out = { type: text(c.type), topLayer: text(c.topLayer), frame: text(c.frame) };
  return out.type || out.topLayer || out.frame ? out : null;
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
    const byTemplate = new Map();
    for (const [key, entry] of Object.entries(raw)) {
      if (key.startsWith('//') || !entry || typeof entry !== 'object') continue;
      byTemplate.set(String(key), clean(entry));
    }
    return byTemplate;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[details] could not read product-details.json:', err.message);
    return new Map();
  }
}

// Read once: the file only changes with a deploy, which restarts the server.
const DETAILS = load();

const NONE = Object.freeze({ description: null, tagline: null, iconKeys: [], warrantyYears: null, layers: [], features: [], compare: null });

/** The catalogue's details for a product (by its Odoo template id) - empty fields when it has none. */
function detailsFor(product) {
  if (product?.templateId == null) return NONE;
  return DETAILS.get(String(product.templateId)) ?? NONE;
}

module.exports = { detailsFor };
