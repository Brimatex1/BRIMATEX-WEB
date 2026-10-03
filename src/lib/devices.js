// Push-notification device registry.
//
// Backed by Postgres when DATABASE_URL is set (store/pg-devices.js), otherwise
// by a local JSONL file (store/file-devices.js) — same API either way, chosen
// once at boot, exactly like src/lib/auth.js.
//
// Besides its token, a device carries what the app reports about its owner's
// choices (POST /api/devices): «العروض» on or off, the delivery city, and when
// the cart last had something added. The offer notifications
// (src/lib/pushCampaigns.js) go only to devices with offers on.

const db = require('./db');

const backend = db.isConfigured() ? require('./store/pg-devices') : require('./store/file-devices');

/** Expo tokens look like ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]. */
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

function isValidToken(token) {
  return typeof token === 'string' && EXPO_TOKEN.test(token.trim());
}

/**
 * The preferences in a POST /api/devices body - only those the app sent (an
 * older app sends none, and the device keeps what it had):
 *   offers  true / false
 *   city    the delivery city's name (≤ 40 characters), or null
 *   cartAt  an ISO time no later than now, or null for an empty cart
 */
function readPrefs(payload, now = Date.now()) {
  const prefs = {};
  if (typeof payload?.offers === 'boolean') prefs.offers = payload.offers;
  if (payload && 'city' in payload) {
    const city = typeof payload.city === 'string' ? payload.city.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    prefs.city = city || null;
  }
  if (payload && 'cartAt' in payload) {
    const at = typeof payload.cartAt === 'string' ? Date.parse(payload.cartAt) : NaN;
    // A phone's clock running ahead must not keep it in «سلة متروكة» forever.
    prefs.cartAt = Number.isFinite(at) ? new Date(Math.min(at, now)).toISOString() : null;
  }
  return prefs;
}

module.exports = {
  isValidToken,
  readPrefs,
  register: backend.register,
  findForOrder: backend.findForOrder,
  findForUser: backend.findForUser,
  remove: backend.remove,
  listPlatforms: backend.listPlatforms,
  listAll: backend.listAll,
  offerHistory: backend.offerHistory,
  recordOffers: backend.recordOffers,
};
