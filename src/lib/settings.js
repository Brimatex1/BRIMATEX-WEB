const fs = require('fs');
const path = require('path');

/**
 * Runtime settings, editable from the dashboard.
 *
 * Odoo credentials used to be read from the environment once at boot, so
 * changing them meant editing .env and restarting. They now live in a file the
 * admin can write through the API, with the environment kept as the fallback —
 * an existing .env deployment keeps working untouched.
 *
 * The file holds an API key, so it is gitignored and never returned to the
 * browser. See readPublicOdoo.
 */

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.local.json');

const ENV_ODOO = {
  url: process.env.ODOO_URL || '',
  db: process.env.ODOO_DB || '',
  username: process.env.ODOO_USERNAME || '',
  apiKey: process.env.ODOO_API_KEY || '',
};

const ENV_FACEBOOK_PIXEL_ID = process.env.FACEBOOK_PIXEL_ID || '';

// The store's one support line — fixed by the business, not expected to
// change. Kept as a hard default (rather than requiring .env on every
// deployment) so the button works out of the box; still overridable via
// WHATSAPP_SUPPORT_PHONE or the dashboard if it ever needs to.
const DEFAULT_WHATSAPP_PHONE = '+218935770070';

const ENV_WHATSAPP_SUPPORT = {
  phone: process.env.WHATSAPP_SUPPORT_PHONE || DEFAULT_WHATSAPP_PHONE,
  message: process.env.WHATSAPP_SUPPORT_MESSAGE || '',
};

const DEFAULT_WHATSAPP_MESSAGE = 'مرحباً، لدي استفسار بخصوص منتجات بريماتكس.';

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeFile(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2) + '\n');
}

/** Stored settings win; anything blank falls back to the environment. */
function getOdoo() {
  const stored = readFile().odoo || {};
  return {
    url: (stored.url || ENV_ODOO.url || '').replace(/\/+$/, ''),
    db: stored.db || ENV_ODOO.db || '',
    username: stored.username || ENV_ODOO.username || '',
    apiKey: stored.apiKey || ENV_ODOO.apiKey || '',
    /** Cached from a successful connection test; avoids guessing the uid. */
    uid: typeof stored.uid === 'number' ? stored.uid : null,
  };
}

/**
 * Everything except the API key, which never leaves the server — the form
 * reports whether one is set rather than showing it.
 */
function readPublicOdoo() {
  const c = getOdoo();
  const stored = readFile().odoo || {};
  return {
    url: c.url,
    db: c.db,
    username: c.username,
    hasApiKey: Boolean(c.apiKey),
    uid: c.uid,
    /** True when values come from .env and no dashboard override exists. */
    fromEnv: !stored.url && Boolean(ENV_ODOO.url),
    configured: Boolean(c.url && c.db && c.username && c.apiKey),
  };
}

/**
 * Saves Odoo settings. An empty apiKey keeps the stored one, so the URL or
 * database can be edited without retyping the secret.
 */
function saveOdoo({ url, db, username, apiKey, uid }) {
  const data = readFile();
  const previous = data.odoo || {};
  data.odoo = {
    url: String(url || '').trim().replace(/\/+$/, ''),
    db: String(db || '').trim(),
    username: String(username || '').trim(),
    apiKey: apiKey ? String(apiKey).trim() : previous.apiKey || '',
    uid: typeof uid === 'number' ? uid : (previous.uid ?? null),
    updatedAt: new Date().toISOString(),
  };
  writeFile(data);
  return readPublicOdoo();
}

function clearOdoo() {
  const data = readFile();
  delete data.odoo;
  writeFile(data);
  return readPublicOdoo();
}

/**
 * A Pixel ID isn't a secret — it's visible in every page's network requests
 * to Facebook on any site that uses one — so unlike Odoo's API key, this is
 * safe to return to the browser as-is. No `hasXxx` masking needed.
 */
function readPublicFacebookPixel() {
  const stored = readFile().facebookPixel || {};
  const pixelId = stored.pixelId || ENV_FACEBOOK_PIXEL_ID || '';
  return {
    pixelId: pixelId || null,
    fromEnv: !stored.pixelId && Boolean(ENV_FACEBOOK_PIXEL_ID),
    configured: Boolean(pixelId),
  };
}

function saveFacebookPixel({ pixelId }) {
  const data = readFile();
  data.facebookPixel = {
    pixelId: String(pixelId || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  writeFile(data);
  return readPublicFacebookPixel();
}

function clearFacebookPixel() {
  const data = readFile();
  delete data.facebookPixel;
  writeFile(data);
  return readPublicFacebookPixel();
}

/**
 * The support phone number isn't a secret either — it's the number printed
 * on the button itself — so like the Pixel ID it's returned to the browser
 * as-is.
 */
function readPublicWhatsappSupport() {
  const stored = readFile().whatsappSupport || {};
  const phone = stored.phone || ENV_WHATSAPP_SUPPORT.phone || '';
  const message =
    stored.message != null ? stored.message : ENV_WHATSAPP_SUPPORT.message || DEFAULT_WHATSAPP_MESSAGE;
  return {
    phone: phone || null,
    message,
    fromEnv: !stored.phone && Boolean(ENV_WHATSAPP_SUPPORT.phone),
    configured: Boolean(phone),
  };
}

function saveWhatsappSupport({ phone, message }) {
  const data = readFile();
  data.whatsappSupport = {
    phone: String(phone || '').trim(),
    message: String(message ?? DEFAULT_WHATSAPP_MESSAGE).trim(),
    updatedAt: new Date().toISOString(),
  };
  writeFile(data);
  return readPublicWhatsappSupport();
}

function clearWhatsappSupport() {
  const data = readFile();
  delete data.whatsappSupport;
  writeFile(data);
  return readPublicWhatsappSupport();
}

module.exports = {
  getOdoo,
  readPublicOdoo,
  saveOdoo,
  clearOdoo,
  readPublicFacebookPixel,
  saveFacebookPixel,
  clearFacebookPixel,
  readPublicWhatsappSupport,
  saveWhatsappSupport,
  clearWhatsappSupport,
};
