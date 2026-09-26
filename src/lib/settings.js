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
    lydPerUsd: stored.lydPerUsd || null,
  };
}

/**
 * `lydPerUsd` (dinars to one dollar) exists because Meta does not accept LYD:
 * it is missing from Meta's supported currencies, so purchase values sent in
 * dinars cannot drive value optimisation or ROAS. With a rate set, the Pixel
 * reports values in USD. Customers never see it - prices on the site stay in
 * dinars. Null keeps the old behaviour (LYD).
 */
function saveFacebookPixel({ pixelId, lydPerUsd }) {
  const data = readFile();
  data.facebookPixel = {
    pixelId: String(pixelId || '').trim(),
    lydPerUsd: lydPerUsd || null,
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
 * Pre-orders (src/lib/preorder.js): with it on, a mattress out of stock in
 * Odoo can still be ordered - the factory makes it to order - and `days` is
 * how long that takes, shown to the customer when set. Not a secret.
 */
function readPreorder() {
  const stored = readFile().preorder || {};
  const days = Number.isInteger(stored.days) && stored.days > 0 ? stored.days : null;
  return { enabled: stored.enabled === true, days };
}

function savePreorder({ enabled, days }) {
  const data = readFile();
  data.preorder = { enabled: Boolean(enabled), days: days || null, updatedAt: new Date().toISOString() };
  writeFile(data);
  return readPreorder();
}

/**
 * The Conversions API access token (Events Manager > dataset > Settings >
 * Conversions API > Generate access token). A secret, unlike the Pixel ID:
 * set from the dashboard or FACEBOOK_CAPI_TOKEN in .env, the dashboard's
 * winning, and never sent back to a browser - the dashboard only learns that
 * one is set, where from, and its last four characters to tell two apart.
 */
const ENV_CAPI_TOKEN = process.env.FACEBOOK_CAPI_TOKEN || '';

function getCapiToken() {
  return readFile().conversionsApi?.token || ENV_CAPI_TOKEN || '';
}

function readPublicCapiToken() {
  const stored = readFile().conversionsApi?.token || '';
  const token = stored || ENV_CAPI_TOKEN;
  return {
    hasToken: Boolean(token),
    source: stored ? 'dashboard' : ENV_CAPI_TOKEN ? 'env' : null,
    last4: token ? token.slice(-4) : null,
  };
}

function saveCapiToken(token) {
  const data = readFile();
  data.conversionsApi = { token: String(token).trim(), updatedAt: new Date().toISOString() };
  writeFile(data);
  return readPublicCapiToken();
}

/** Drops the dashboard's token - FACEBOOK_CAPI_TOKEN in .env, if any, applies again. */
function clearCapiToken() {
  const data = readFile();
  delete data.conversionsApi;
  writeFile(data);
  return readPublicCapiToken();
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

/**
 * The home page's sliding banners (src/lib/banners.js owns the rules) - kept
 * here because this file survives deploys, as the Pixel and WhatsApp settings
 * do. Public: every visitor sees them.
 */
function readBanners() {
  const list = readFile().banners;
  return Array.isArray(list) ? list : [];
}

function writeBanners(list) {
  const data = readFile();
  data.banners = list;
  writeFile(data);
}

module.exports = {
  readBanners,
  writeBanners,
  getOdoo,
  readPublicOdoo,
  saveOdoo,
  clearOdoo,
  readPublicFacebookPixel,
  saveFacebookPixel,
  readPreorder,
  savePreorder,
  getCapiToken,
  readPublicCapiToken,
  saveCapiToken,
  clearCapiToken,
  clearFacebookPixel,
  readPublicWhatsappSupport,
  saveWhatsappSupport,
  clearWhatsappSupport,
};
