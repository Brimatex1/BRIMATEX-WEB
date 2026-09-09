// Postgres-backed push-device registry. Used when DATABASE_URL is set —
// see src/lib/devices.js. Table defined in src/lib/db.js.
//
// Written for PostgreSQL 9.2 like the rest of the schema: no `on conflict`,
// so re-registering a token deletes then inserts. See docs/POSTGRES_SETUP.md.

const db = require('../db');

function toDevice(row) {
  if (!row) return null;
  return {
    token: row.token,
    platform: row.platform,
    userId: row.user_id,
    lastOrder: row.last_order,
    registeredAt: row.registered_at,
  };
}

async function register({ token, platform, userId, orderName }) {
  await db.query('delete from devices where token = $1', [token]);
  await db.query(
    'insert into devices (token, platform, user_id, last_order) values ($1, $2, $3, $4)',
    [token, platform, userId || null, orderName || null]
  );
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

async function remove(token) {
  await db.query('delete from devices where token = $1', [token]);
}

module.exports = { register, findForOrder, remove };
