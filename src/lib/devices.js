// Push-notification device registry.
//
// Backed by Postgres when DATABASE_URL is set (store/pg-devices.js), otherwise
// by a local JSONL file (store/file-devices.js) — same API either way, chosen
// once at boot, exactly like src/lib/auth.js.

const db = require('./db');

const backend = db.isConfigured() ? require('./store/pg-devices') : require('./store/file-devices');

/** Expo tokens look like ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]. */
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

function isValidToken(token) {
  return typeof token === 'string' && EXPO_TOKEN.test(token.trim());
}

module.exports = {
  isValidToken,
  register: backend.register,
  findForOrder: backend.findForOrder,
  remove: backend.remove,
};
