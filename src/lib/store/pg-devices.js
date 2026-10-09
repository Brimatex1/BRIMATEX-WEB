// Postgres-backed push-device registry. Used when DATABASE_URL is set —
// see src/lib/devices.js. Tables defined in src/lib/db.js (devices, offer_sends).
//
// Written for PostgreSQL 9.2 like the rest of the schema: no `on conflict`,
// so registering a token updates its row, and inserts one only when there was
// none. See docs/POSTGRES_SETUP.md.

const db = require('../db');

function toDevice(row) {
  if (!row) return null;
  return {
    token: row.token,
    platform: row.platform,
    userId: row.user_id || null,
    lastOrder: row.last_order || null,
    registeredAt: row.registered_at,
    offers: row.offers === true,
    city: row.city || null,
    cartAt: row.cart_at ? new Date(row.cart_at).toISOString() : null,
  };
}

/**
 * Adds or updates a device. `orderName` and each of `prefs` (offers, city,
 * cartAt) left undefined keep what the row had - see store/file-devices.js.
 */
async function register({ token, platform, userId, orderName, prefs = {} }) {
  const { rows } = await db.query('select * from devices where token = $1', [token]);
  const prev = toDevice(rows[0]) || {};
  const values = [
    token,
    platform,
    userId || null,
    orderName || prev.lastOrder || null,
    prefs.offers === undefined ? prev.offers === true : prefs.offers,
    prefs.city === undefined ? prev.city || null : prefs.city,
    prefs.cartAt === undefined ? prev.cartAt || null : prefs.cartAt,
  ];
  const update = () =>
    db.query(
      `update devices set platform = $2, user_id = $3, last_order = $4, offers = $5, city = $6, cart_at = $7, registered_at = now()
        where token = $1`,
      values
    );
  if (rows[0]) return void (await update());
  try {
    await db.query(
      'insert into devices (token, platform, user_id, last_order, offers, city, cart_at) values ($1, $2, $3, $4, $5, $6, $7)',
      values
    );
  } catch (err) {
    // The same phone registering twice at once: the other request inserted it.
    if (err.code !== '23505') throw err;
    await update();
  }
}

async function findForOrder({ userId, orderName }) {
  const { rows } = await db.query(
    `select * from devices
      where ($1::uuid is not null and user_id = $1::uuid)
         or ($2::text is not null and last_order = $2::text)`,
    [userId || null, orderName || null]
  );
  return rows.map(toDevice);
}

/** A signed-in person's own devices (the panel's «إرسال تجريبي لجهازي»). */
async function findForUser(userId) {
  if (!userId) return [];
  const { rows } = await db.query('select * from devices where user_id = $1', [userId]);
  return rows.map(toDevice);
}

async function remove(token) {
  await db.query('delete from devices where token = $1', [token]);
}

/** A deleted account's phones - explicit, though the foreign key cascades too. */
async function forgetUser(userId) {
  await db.query('delete from devices where user_id = $1', [userId]);
}

/** Every device's platform with its owner and last order - the panel's iOS / Android split. No tokens. */
async function listPlatforms() {
  const { rows } = await db.query('select platform, user_id, last_order from devices');
  return rows.map((r) => ({ platform: r.platform, userId: r.user_id || null, lastOrder: r.last_order || null }));
}

/** Every device with its preferences - the offer notifications' audiences. */
async function listAll() {
  const { rows } = await db.query('select * from devices');
  return rows.map(toDevice);
}

/** The offer notifications sent since `sinceIso`: [{ token, campaignId, at }]. */
async function offerHistory(sinceIso) {
  const { rows } = await db.query('select token, campaign_id, sent_at from offer_sends where sent_at >= $1', [sinceIso]);
  return rows.map((r) => ({ token: r.token, campaignId: r.campaign_id, at: new Date(r.sent_at).toISOString() }));
}

/**
 * Notes that `campaignId` goes to these devices, before it is sent, and
 * returns the tokens newly noted. The primary key (token, campaign_id) is what
 * makes a campaign reach a phone once: a second server process sending the
 * same campaign at the same moment fails on the insert and sends nothing.
 */
async function recordOffers(tokens, campaignId, atIso) {
  if (!tokens.length) return [];
  // Old rows only feed the weekly limit, which looks back 7 days.
  await db.query("delete from offer_sends where sent_at < now() - interval '30 days'");
  try {
    const { rows } = await db.query(
      `insert into offer_sends (token, campaign_id, sent_at)
       select t, $2, $3 from unnest($1::text[]) as t
        where exists (select 1 from devices d where d.token = t)
          and not exists (select 1 from offer_sends o where o.token = t and o.campaign_id = $2)
       returning token`,
      [tokens, campaignId, atIso]
    );
    return rows.map((r) => r.token);
  } catch (err) {
    if (err.code === '23505') return [];
    throw err;
  }
}

module.exports = { register, findForOrder, findForUser, remove, forgetUser, listPlatforms, listAll, offerHistory, recordOffers };
