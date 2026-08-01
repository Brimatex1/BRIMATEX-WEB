// File-backed accounts store (JSONL). Used when DATABASE_URL is not set —
// see src/lib/auth.js, which picks this or store/pg-auth.js.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword, verifyPassword, generateToken } = require('./password');

const USERS_FILE = path.join(__dirname, '..', '..', 'data', 'users.jsonl');
const SESSIONS_FILE = path.join(__dirname, '..', '..', 'data', 'sessions.jsonl');

const SESSION_DAYS = 30;

function ensureFiles() {
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '');
  if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, '');
}

function readUsers() {
  ensureFiles();
  try {
    return fs
      .readFileSync(USERS_FILE, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, users.map((u) => JSON.stringify(u)).join('\n') + '\n');
}

function readSessions() {
  ensureFiles();
  try {
    return fs
      .readFileSync(SESSIONS_FILE, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function writeSessions(sessions) {
  fs.writeFileSync(
    SESSIONS_FILE,
    sessions.length ? sessions.map((s) => JSON.stringify(s)).join('\n') + '\n' : ''
  );
}

/* -------------------------------------------------------------------- users */

async function createUser(phone, password, name) {
  const users = readUsers();
  if (users.find((u) => u.phone === phone)) return null;

  const user = {
    id: crypto.randomUUID(),
    email: `user_${Date.now()}@brimatex.local`,
    passwordHash: await hashPassword(password),
    name: name.trim(),
    phone: phone.trim(),
    role: 'customer',
    odooPartnerId: null,
    createdAt: new Date().toISOString(),
    addresses: [],
    wishlist: [],
  };

  writeUsers([...users, user]);
  return stripHash(user);
}

async function authenticate(phone, password) {
  const users = readUsers();
  const user = users.find((u) => u.phone === phone);
  if (!user) return null;

  const { ok, needsUpgrade } = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  if (needsUpgrade) {
    await updateUser(user.id, { passwordHash: await hashPassword(password) });
  }

  return stripHash(user);
}

/** Public shape never carries the password hash out of this module. */
function stripHash(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

async function getUser(userId) {
  const user = readUsers().find((u) => u.id === userId);
  return stripHash(user) || null;
}

async function updateUser(userId, updates) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;

  users[idx] = { ...users[idx], ...updates };
  writeUsers(users);
  return stripHash(users[idx]);
}

async function listUsers() {
  return readUsers().map((u) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    addressCount: (u.addresses || []).length,
    wishlistCount: (u.wishlist || []).length,
  }));
}

/* --------------------------------------------------------------- addresses */

async function listAddresses(userId) {
  const user = readUsers().find((u) => u.id === userId);
  return user?.addresses || [];
}

async function addAddress(userId, { address, city }) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;

  const record = {
    id: Math.random().toString(36).slice(2),
    address,
    city,
    createdAt: new Date().toISOString(),
  };
  users[idx].addresses = [...(users[idx].addresses || []), record];
  writeUsers(users);
  return record;
}

async function removeAddress(userId, addressId) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return false;

  const before = users[idx].addresses || [];
  users[idx].addresses = before.filter((a) => a.id !== addressId);
  writeUsers(users);
  return users[idx].addresses.length !== before.length;
}

/* ---------------------------------------------------------------- wishlist */

async function listWishlist(userId) {
  const user = readUsers().find((u) => u.id === userId);
  return user?.wishlist || [];
}

async function addWishlistItem(userId, productId) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;

  users[idx].wishlist = users[idx].wishlist || [];
  if (!users[idx].wishlist.find((w) => Number(w.productId) === productId)) {
    users[idx].wishlist.push({ productId, addedAt: new Date().toISOString() });
    writeUsers(users);
  }
  return true;
}

async function removeWishlistItem(userId, productId) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return false;

  const before = users[idx].wishlist || [];
  users[idx].wishlist = before.filter((w) => Number(w.productId) !== productId);
  writeUsers(users);
  return true;
}

/* ----------------------------------------------------------------- sessions */

/** Drops expired rows. Without this the file grows forever. */
function pruneSessions() {
  const now = Date.now();
  const sessions = readSessions();
  const live = sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
  if (live.length !== sessions.length) writeSessions(live);
  return live;
}

async function createSession(userId) {
  const token = generateToken();
  const session = {
    token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };

  // Prune on write so expiry cleanup needs no scheduler.
  const live = pruneSessions();
  writeSessions([...live, session]);
  return token;
}

async function verifySession(token) {
  if (!token) return null;
  const session = readSessions().find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;
  return session;
}

/**
 * Invalidates a token server-side. Logout previously only cleared the browser's
 * copy, leaving the token usable for the rest of its 30 days.
 */
async function deleteSession(token) {
  if (!token) return false;
  const sessions = readSessions();
  const remaining = sessions.filter((s) => s.token !== token);
  if (remaining.length === sessions.length) return false;
  writeSessions(remaining);
  return true;
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
