// Password hashing, shared by every storage backend (file or Postgres) —
// it has nothing to do with where the hash ends up being stored.

const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;

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

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verifyPassword, generateToken };
