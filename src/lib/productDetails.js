/**
 * Each mattress's details from the printed catalogue - its description, spec
 * icons, warranty and layers - shipped with the site in
 * src/data/product-details.json and matched by Odoo name, like the photos
 * (src/lib/productPhotos.js). Odoo holds none of this; the dashboard can still
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
    const byName = new Map();
    for (const [name, entry] of Object.entries(raw)) {
      if (name.startsWith('//') || !entry || typeof entry !== 'object') continue;
      byName.set(name.trim().toLowerCase(), clean(entry));
    }
    return byName;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[details] could not read product-details.json:', err.message);
    return new Map();
  }
}

// Read once: the file only changes with a deploy, which restarts the server.
const DETAILS = load();

const NONE = Object.freeze({ description: null, iconKeys: [], warrantyYears: null, layers: [] });

/** The catalogue's details for a product name - empty fields when it has none. */
function detailsFor(name) {
  if (!name) return NONE;
  return DETAILS.get(String(name).trim().toLowerCase()) ?? NONE;
}

module.exports = { detailsFor };
