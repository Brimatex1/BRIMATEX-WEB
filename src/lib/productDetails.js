/**
 * Each mattress's details from the printed catalogue - its description, spec
 * icons, warranty and layers - shipped with the site in
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
    iconKeys: Array.isArray(entry.iconKeys) ? entry.iconKeys.filter((k) => typeof k === 'string') : [],
    warrantyYears: Number.isInteger(entry.warrantyYears) && entry.warrantyYears > 0 ? entry.warrantyYears : null,
    layers: Array.isArray(entry.layers) ? entry.layers.filter((l) => typeof l === 'string' && l.trim()) : [],
  };
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

const NONE = Object.freeze({ description: null, iconKeys: [], warrantyYears: null, layers: [] });

/** The catalogue's details for a product (by its Odoo template id) - empty fields when it has none. */
function detailsFor(product) {
  if (product?.templateId == null) return NONE;
  return DETAILS.get(String(product.templateId)) ?? NONE;
}

module.exports = { detailsFor };
