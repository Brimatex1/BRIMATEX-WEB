/**
 * Product photos that ship with the site - the owner's official pictures,
 * kept in the repository under web/public/images/products/ (the web build
 * copies them into src/public, which it empties first - a photo put straight
 * into src/public is deleted by the next build) and matched to a product by
 * its Odoo product (template) id in src/data/product-photos.json. The id,
 * not the name: the names are edited in Odoo (English to Arabic, once), and
 * a rename used to take every photo off the site.
 *
 * They are the default: a photo uploaded from the dashboard still wins
 * (src/lib/catalogue.js), and Odoo's own pictures stay off.
 *
 * An entry may also name `layers`: the cutaway showing what is inside the
 * mattress, the second picture on its product page.
 */
const fs = require('fs');
const path = require('path');

const MAP_FILE = path.join(__dirname, '..', 'data', 'product-photos.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
// The source the build copies from - there before the first build, too.
const SOURCE_DIR = path.join(__dirname, '..', '..', 'web', 'public');

/** Where a shipped photo is served from - the image route accepts this prefix. */
const PHOTO_PREFIX = '/images/products/';

/** The served URL of a shipped file, or null (and said) when the file is not there. */
function shipped(file, label) {
  const url = PHOTO_PREFIX + file;
  // A mapping to a file that is not there would 404 on every card - skip it and say so.
  if (!fs.existsSync(path.join(PUBLIC_DIR, url)) && !fs.existsSync(path.join(SOURCE_DIR, url))) {
    console.error(`[photos] ${label}: ${url} is missing`);
    return null;
  }
  return url;
}

function load() {
  const byTemplate = new Map();
  const layersByTemplate = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
    for (const [key, entry] of Object.entries(raw)) {
      if (key.startsWith('//') || !entry) continue;
      const label = entry.product || key;
      const photo = entry.file ? shipped(entry.file, label) : null;
      if (photo) byTemplate.set(String(key), photo);
      const layers = entry.layers ? shipped(entry.layers, label) : null;
      if (layers) layersByTemplate.set(String(key), layers);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[photos] could not read product-photos.json:', err.message);
  }
  return { byTemplate, layersByTemplate };
}

// Read once: the file only changes with a deploy, which restarts the server.
const { byTemplate: PHOTOS, layersByTemplate: LAYERS } = load();

/** The shipped photo for a product (by its Odoo template id), or null. */
function photoFor(product) {
  if (product?.templateId == null) return null;
  return PHOTOS.get(String(product.templateId)) ?? null;
}

/** The shipped cutaway of what is inside a product, or null. */
function layersPhotoFor(product) {
  if (product?.templateId == null) return null;
  return LAYERS.get(String(product.templateId)) ?? null;
}

module.exports = { photoFor, layersPhotoFor, PHOTO_PREFIX };
