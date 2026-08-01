// Postgres-backed accounts store. Used when DATABASE_URL is set — see
// src/lib/auth.js, which picks this or store/file-auth.js.

const crypto = require('crypto');
const db = require('../db');
const { hashPassword, verifyPassword, generateToken } = require('./password');

const SESSION_DAYS = 30;

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    role: row.role,
    odooPartnerId: row.odoo_partner_id,
    createdAt: row.created_at,
  };
}

/* -------------------------------------------------------------------- users */

async function createUser(phone, password, name) {
  const existing = await db.query('select 1 from users where phone = $1', [phone]);
  if (existing.rowCount > 0) return null;

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const email = `user_${Date.now()}@brimatex.local`;

  const { rows } = await db.query(
    `insert into users (id, phone, email, password_hash, name, role)
     values ($1, $2, $3, $4, $5, 'customer')
     returning *`,
    [id, phone.trim(), email, passwordHash, name.trim()]
  );
  return toUser(rows[0]);
}

async function authenticate(phone, password) {
  const { rows } = await db.query('select * from users where phone = $1', [phone]);
  const row = rows[0];
  if (!row) return null;

  const { ok, needsUpgrade } = await verifyPassword(password, row.password_hash);
  if (!ok) return null;

  if (needsUpgrade) {
    await db.query('update users set password_hash = $1 where id = $2', [
      await hashPassword(password),
      row.id,
    ]);
  }

  return toUser(row);
}

async function getUser(userId) {
  const { rows } = await db.query('select * from users where id = $1', [userId]);
  return toUser(rows[0]);
}

const UPDATABLE_COLUMNS = { role: 'role', passwordHash: 'password_hash', odooPartnerId: 'odoo_partner_id' };

async function updateUser(userId, updates) {
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (updates[key] === undefined) continue;
    params.push(updates[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) return getUser(userId);

  params.push(userId);
  const { rows } = await db.query(
    `update users set ${sets.join(', ')} where id = $${params.length} returning *`,
    params
  );
  return toUser(rows[0]);
}

async function listUsers() {
  const { rows } = await db.query(`
    select u.*,
      (select count(*) from addresses a where a.user_id = u.id) as address_count,
      (select count(*) from wishlist_items w where w.user_id = u.id) as wishlist_count
    from users u
    order by u.created_at desc
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    addressCount: Number(row.address_count),
    wishlistCount: Number(row.wishlist_count),
  }));
}

/* --------------------------------------------------------------- addresses */

async function listAddresses(userId) {
  const { rows } = await db.query(
    'select id, address, city, created_at from addresses where user_id = $1 order by created_at asc',
    [userId]
  );
  return rows.map((r) => ({ id: r.id, address: r.address, city: r.city, createdAt: r.created_at }));
}

async function addAddress(userId, { address, city }) {
  const id = Math.random().toString(36).slice(2);
  const { rows } = await db.query(
    'insert into addresses (id, user_id, address, city) values ($1, $2, $3, $4) returning id, address, city, created_at',
    [id, userId, address, city]
  );
  const r = rows[0];
  return { id: r.id, address: r.address, city: r.city, createdAt: r.created_at };
}

async function removeAddress(userId, addressId) {
  const { rowCount } = await db.query('delete from addresses where id = $1 and user_id = $2', [
    addressId,
    userId,
  ]);
  return rowCount > 0;
}

/* ---------------------------------------------------------------- wishlist */

async function listWishlist(userId) {
  const { rows } = await db.query(
    'select product_id, added_at from wishlist_items where user_id = $1 order by added_at asc',
    [userId]
  );
  return rows.map((r) => ({ productId: r.product_id, addedAt: r.added_at }));
}

async function addWishlistItem(userId, productId) {
  await db.query(
    `insert into wishlist_items (user_id, product_id) values ($1, $2)
     on conflict (user_id, product_id) do nothing`,
    [userId, productId]
  );
  return true;
}

async function removeWishlistItem(userId, productId) {
  await db.query('delete from wishlist_items where user_id = $1 and product_id = $2', [
    userId,
    productId,
  ]);
  return true;
}

/* ----------------------------------------------------------------- sessions */

async function createSession(userId) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.query('insert into sessions (token, user_id, expires_at) values ($1, $2, $3)', [
    token,
    userId,
    expiresAt,
  ]);
  return token;
}

async function verifySession(token) {
  if (!token) return null;
  const { rows } = await db.query(
    'select token, user_id as "userId", expires_at as "expiresAt" from sessions where token = $1',
    [token]
  );
  const session = rows[0];
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;
  return session;
}

async function deleteSession(token) {
  if (!token) return false;
  const { rowCount } = await db.query('delete from sessions where token = $1', [token]);
  return rowCount > 0;
}

module.exports = {
  createUser,
  authenticate,
  getUser,
  updateUser,
  listUsers,
  listAddresses,
  addAddress,
  removeAddress,
  listWishlist,
  addWishlistItem,
  removeWishlistItem,
  createSession,
  verifySession,
  deleteSession,
};
