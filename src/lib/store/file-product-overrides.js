// File-backed product overrides (icons, description, enabled, image). Used
// when DATABASE_URL is not set — see src/lib/productOverrides.js, which
// picks this or store/pg-product-overrides.js.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'product-overrides.local.json');

const DEFAULTS = { iconKeys: [], description: null, enabled: true, imageUrl: null };

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
}

async function getOverridesForProduct(productId) {
  const all = readAll();
  return { ...DEFAULTS, ...all[String(productId)] };
}

async function getAllOverrides() {
  const all = readAll();
  const out = {};
  for (const [id, o] of Object.entries(all)) out[id] = { ...DEFAULTS, ...o };
  return out;
}

async function setOverridesForProduct(productId, changes) {
  const all = readAll();
  const key = String(productId);
  const current = { ...DEFAULTS, ...all[key] };
  const next = { ...current, ...changes };
  all[key] = next;
  writeAll(all);
  return next;
}

module.exports = { getOverridesForProduct, getAllOverrides, setOverridesForProduct };
