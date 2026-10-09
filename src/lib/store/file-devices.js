// File-backed push-device registry (JSONL). Used when DATABASE_URL is not set —
// see src/lib/devices.js, which picks this or store/pg-devices.js.
//
// One row per device token. A token is re-registered on every order and every
// time the app reports its preferences, so the row is updated rather than
// appended: the file stays the size of "phones that have the app", not
// "orders ever placed".
//
// The offer notifications each device received (src/lib/pushCampaigns.js) sit
// on its row as `offerSends` - the weekly limit counts them - pruned to the
// last 30 days.

const fs = require('fs');
const path = require('path');

// A test server keeps its own file (like BRIMATEX_SETTINGS_FILE).
const FILE = process.env.BRIMATEX_DEVICES_FILE || path.join(__dirname, '..', '..', 'data', 'devices.jsonl');
const KEEP_SENDS_MS = 30 * 24 * 3600_000;

function readAll() {
  try {
    if (!fs.existsSync(FILE)) return [];
    return fs
      .readFileSync(FILE, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function writeAll(rows) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, rows.length ? rows.map((r) => JSON.stringify(r)).join('\n') + '\n' : '');
}

/** A row as the rest of the server sees it - rows written before the preferences existed have offers off. */
function toDevice(r) {
  return {
    token: r.token,
    platform: r.platform,
    userId: r.userId || null,
    lastOrder: r.lastOrder || null,
    registeredAt: r.registeredAt || null,
    offers: r.offers === true,
    city: r.city || null,
    cartAt: r.cartAt || null,
  };
}

/**
 * Adds or updates a device. `orderName` and each of `prefs` (offers, city,
 * cartAt) left undefined keep what the row had: an order's registration does
 * not reset the customer's choices, and a preference report does not forget
 * the guest's last order.
 */
async function register({ token, platform, userId, orderName, prefs = {} }) {
  const rows = readAll();
  const prev = rows.find((r) => r.token === token) || {};
  const next = {
    token,
    platform,
    userId: userId || null,
    // Lets a guest who ordered without an account still be told when that one
    // order moves. Overwritten by their next order, which is what we want.
    lastOrder: orderName || prev.lastOrder || null,
    registeredAt: new Date().toISOString(),
    offers: prefs.offers === undefined ? prev.offers === true : prefs.offers,
    city: prefs.city === undefined ? prev.city || null : prefs.city,
    cartAt: prefs.cartAt === undefined ? prev.cartAt || null : prefs.cartAt,
    offerSends: prev.offerSends || [],
  };
  writeAll([...rows.filter((r) => r.token !== token), next]);
}

/** Every device that should hear about this order — its owner's, plus the guest device that placed it. */
async function findForOrder({ userId, orderName }) {
  return readAll()
    .filter((r) => (userId && r.userId === userId) || (orderName && r.lastOrder === orderName))
    .map(toDevice);
}

/** A signed-in person's own devices (the panel's «إرسال تجريبي لجهازي»). */
async function findForUser(userId) {
  if (!userId) return [];
  return readAll()
    .filter((r) => r.userId === userId)
    .map(toDevice);
}

/** Expo tells us when a token is dead; keeping it only wastes later requests. */
async function remove(token) {
  writeAll(readAll().filter((r) => r.token !== token));
}

/** A deleted account's phones (pg-devices has the foreign key's cascade instead). */
async function forgetUser(userId) {
  writeAll(readAll().filter((r) => r.userId !== userId));
}

/** Every device's platform with its owner and last order - the panel's iOS / Android split. No tokens. */
async function listPlatforms() {
  return readAll().map((r) => ({ platform: r.platform, userId: r.userId || null, lastOrder: r.lastOrder || null }));
}

/** Every device with its preferences - the offer notifications' audiences. */
async function listAll() {
  return readAll().map(toDevice);
}

/** The offer notifications sent since `sinceIso`: [{ token, campaignId, at }]. */
async function offerHistory(sinceIso) {
  const since = Date.parse(sinceIso);
  const out = [];
  for (const r of readAll()) {
    for (const s of r.offerSends || []) {
      if (Date.parse(s.at) >= since) out.push({ token: r.token, campaignId: s.c, at: s.at });
    }
  }
  return out;
}

/**
 * Notes that `campaignId` goes to these devices, before it is sent, and
 * returns the tokens newly noted: a device that already has this campaign is
 * left out, so a campaign never reaches the same phone twice.
 */
async function recordOffers(tokens, campaignId, atIso) {
  const wanted = new Set(tokens);
  const claimed = [];
  const cutoff = Date.parse(atIso) - KEEP_SENDS_MS;
  const rows = readAll().map((r) => {
    if (!wanted.has(r.token)) return r;
    const sends = (r.offerSends || []).filter((s) => Date.parse(s.at) >= cutoff);
    if (sends.some((s) => s.c === campaignId)) return { ...r, offerSends: sends };
    claimed.push(r.token);
    return { ...r, offerSends: [...sends, { c: campaignId, at: atIso }] };
  });
  writeAll(rows);
  return claimed;
}

module.exports = { register, findForOrder, findForUser, remove, forgetUser, listPlatforms, listAll, offerHistory, recordOffers };
