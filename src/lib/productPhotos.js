/**
 * Product photos that ship with the site - the owner's official pictures,
 * kept in the repository under web/public/images/products/ (the web build
 * copies them into src/public, which it empties first - a photo put straight
 * into src/public is deleted by the next build) and matched to a
 * product by its Odoo name (src/data/product-photos.json), which survives a
 * re-sync where ids might not.
 *
 * They are the default: a photo uploaded from the dashboard still wins
 * (src/lib/catalogue.js), and Odoo's own pictures stay off.
 */
const fs = require('fs');
const path = require('path');

const MAP_FILE = path.join(__dirname, '..', 'data', 'product-photos.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
// The source the build copies from - there before the first build, too.
const SOURCE_DIR = path.join(__dirname, '..', '..', 'web', 'public');

/** Where a shipped photo is served from - the image route accepts this prefix. */
const PHOTO_PREFIX = '/images/products/';

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
    const byName = new Map();
    for (const [name, file] of Object.entries(raw)) {
      if (name.startsWith('//')) continue;
      const url = PHOTO_PREFIX + file;
      // A mapping to a file that is not there would 404 on every card - skip it and say so.
      if (!fs.existsSync(path.join(PUBLIC_DIR, url)) && !fs.existsSync(path.join(SOURCE_DIR, url))) {
        console.error(`[photos] ${name}: ${url} is missing`);
        continue;
      }
      byName.set(name.trim().toLowerCase(), url);
    }
    return byName;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[photos] could not read product-photos.json:', err.message);
    return new Map();
  }
}

// Read once: the file only changes with a deploy, which restarts the server.
const PHOTOS = load();

/** The shipped photo for a product name, or null. */
function photoFor(name) {
  if (!name) return null;
  return PHOTOS.get(String(name).trim().toLowerCase()) ?? null;
}

module.exports = { photoFor, PHOTO_PREFIX };
