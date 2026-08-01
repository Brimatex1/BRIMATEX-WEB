const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.jsonl');
const SESSIONS_FILE = path.join(__dirname, '..', 'data', 'sessions.jsonl');

const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;

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

function ensureFiles() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '');
  }
  if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, '');
  }
}

/* ---------------------------------------------------------------- passwords */

/**
 * Stored as `scrypt$<salt>$<hash>`.
 *
 * The previous scheme was a bare SHA-256 hex digest: fast to brute-force and
 * unsalted, so one rainbow table cracks every account at once. Existing hashes
 * are still accepted at login and transparently re-hashed — see verifyPassword.
 */
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derived) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt}$${derived.toString('hex')}`);
    });
  });
}

function legacyHash(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/** Constant-time compare that tolerates differing lengths. */
function safeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Resolves { ok, needsUpgrade }. `needsUpgrade` marks an old SHA-256 hash that
 * matched, so the caller can replace it with a scrypt one while it holds the
 * plaintext — the only moment an upgrade is possible.
 */
function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    if (typeof stored !== 'string' || !stored) {
      return resolve({ ok: false, needsUpgrade: false });
    }

    if (!stored.startsWith('scrypt$')) {
      return resolve({ ok: safeEqual(legacyHash(password), stored), needsUpgrade: true });
    }

    const [, salt, expected] = stored.split('$');
    if (!salt || !expected) return resolve({ ok: false, needsUpgrade: false });

    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derived) => {
      if (err) return reject(err);
      resolve({ ok: safeEqual(derived.toString('hex'), expected), needsUpgrade: false });
    });
  });
}

/* ------------------------------------------------------------------- tokens */

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/* -------------------------------------------------------------------- users */

async function createUser(phone, password, name) {
  ensureFiles();
  const users = readUsers();

  if (users.find((u) => u.phone === phone)) {
    return null;
  }

  const user = {
    id: crypto.randomUUID(),
    email: `user_${Date.now()}@brimatex.local`,
    passwordHash: await hashPassword(password),
    name: name.trim(),
    phone: phone.trim(),
    role: 'customer',
    createdAt: new Date().toISOString(),
    addresses: [],
    wishlist: [],
    orders: [],
  };

  fs.appendFileSync(USERS_FILE, JSON.stringify(user) + '\n');
  return user;
}

async function authenticate(phone, password) {
  ensureFiles();
  const users = readUsers();
  const user = users.find((u) => u.phone === phone);

  if (!user) return null;

  const { ok, needsUpgrade } = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  if (needsUpgrade) {
    // Move the account off SHA-256 now that the plaintext is in hand.
    updateUser(user.id, { passwordHash: await hashPassword(password) });
  }

  return user;
}

function getUser(userId) {
  ensureFiles();
  const users = readUsers();
  return users.find((u) => u.id === userId) || null;
}

function updateUser(userId, updates) {
  ensureFiles();
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);

  if (idx === -1) return null;

  users[idx] = { ...users[idx], ...updates };
  fs.writeFileSync(USERS_FILE, users.map((u) => JSON.stringify(u)).join('\n') + '\n');

  return users[idx];
}

/* ----------------------------------------------------------------- sessions */

function writeSessions(sessions) {
  fs.writeFileSync(
    SESSIONS_FILE,
    sessions.length ? sessions.map((s) => JSON.stringify(s)).join('\n') + '\n' : ''
  );
}

/** Drops expired rows. Without this the file grows forever. */
function pruneSessions() {
  ensureFiles();
  const now = Date.now();
  const sessions = readSessions();
  const live = sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
  if (live.length !== sessions.length) writeSessions(live);
  return live;
}

function createSession(userId) {
  ensureFiles();
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

function verifySession(token) {
  ensureFiles();
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
function deleteSession(token) {
  ensureFiles();
  if (!token) return false;
  const sessions = readSessions();
  const remaining = sessions.filter((s) => s.token !== token);
  if (remaining.length === sessions.length) return false;
  writeSessions(remaining);
  return true;
}

/* ------------------------------------------------------------------ storage */

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

/** Every user, without password hashes. Admin listings only. */
function listUsers() {
  return readUsers().map((u) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: roleOf(u),
    /** Env-granted admins cannot be demoted through the UI. */
    locked: isBootstrapAdmin(u.phone),
    createdAt: u.createdAt,
    addressCount: (u.addresses || []).length,
    wishlistCount: (u.wishlist || []).length,
  }));
}

module.exports = {
  createUser,
  authenticate,
  createSession,
  verifySession,
  deleteSession,
  pruneSessions,
  getUser,
  updateUser,
  listUsers,
  roleOf,
  isAdmin,
  isBootstrapAdmin,
};
