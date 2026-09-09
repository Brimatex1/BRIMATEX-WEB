// Accounts, sessions, addresses and wishlist.
//
// Backed by Postgres when DATABASE_URL is set (store/pg-auth.js), otherwise by
// local JSONL files (store/file-auth.js) — same API either way, chosen once
// at boot. See src/lib/db.js for the Postgres schema.

const db = require('./db');
const { hashPassword } = require('./store/password');
const backend = db.isConfigured() ? require('./store/pg-auth') : require('./store/file-auth');

/**
 * Replaces a password and drops every session the user holds.
 *
 * The sessions matter: recovery exists for someone who lost control of the
 * account, and leaving a 30-day token alive would let whoever took it keep
 * using it after the owner believes they have fixed things.
 */
async function setPassword(userId, password) {
  const user = await backend.updateUser(userId, { passwordHash: await hashPassword(password) });
  await backend.deleteSessionsForUser(userId);
  return user;
}

/**
 * Bootstrap admins. There is no way to appoint the first one from inside the
 * app, so the phone numbers listed here are treated as admins on sight:
 *
 *   ADMIN_PHONES=0912345678,0921112222
 *
 * Kept in the environment rather than the database so it is never committed and
 * cannot be granted through the UI. Once an admin exists they can promote others,
 * which is stored on the user record.
 */
const ADMIN_PHONES = String(process.env.ADMIN_PHONES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isBootstrapAdmin(phone) {
  return ADMIN_PHONES.includes(String(phone || '').trim());
}

/** A user's effective role — the env bootstrap outranks the stored value. */
function roleOf(user) {
  if (!user) return null;
  if (isBootstrapAdmin(user.phone)) return 'admin';
  return user.role === 'admin' ? 'admin' : 'customer';
}

function isAdmin(user) {
  return roleOf(user) === 'admin';
}

/** Every user, without password hashes. Admin listings only. */
async function listUsers() {
  const users = await backend.listUsers();
  return users.map((u) => ({
    ...u,
    role: roleOf(u),
    // Env-granted admins cannot be demoted through the UI.
    locked: isBootstrapAdmin(u.phone),
  }));
}

module.exports = {
  createUser: backend.createUser,
  authenticate: backend.authenticate,
  getUser: backend.getUser,
  findByPhone: backend.findByPhone,
  updateUser: backend.updateUser,
  listUsers,
  listAddresses: backend.listAddresses,
  addAddress: backend.addAddress,
  removeAddress: backend.removeAddress,
  listWishlist: backend.listWishlist,
  addWishlistItem: backend.addWishlistItem,
  removeWishlistItem: backend.removeWishlistItem,
  setPassword,
  createSession: backend.createSession,
  verifySession: backend.verifySession,
  deleteSession: backend.deleteSession,
  deleteUser: backend.deleteUser,
  roleOf,
  isAdmin,
  isBootstrapAdmin,
};
