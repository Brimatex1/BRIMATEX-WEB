// Postgres-backed OTP challenges. Used when DATABASE_URL is set —
// see src/lib/otp.js. Table defined in src/lib/db.js.
//
// Written for PostgreSQL 9.2 like the rest of the schema: no `on conflict`,
// so a re-request deletes then inserts. See docs/POSTGRES_SETUP.md.

const db = require('../db');

function toChallenge(row) {
  if (!row) return null;
  return {
    phone: row.phone,
    codeHash: row.code_hash,
    resetToken: row.reset_token,
    attempts: row.attempts,
    sentAt: row.sent_at,
    expiresAt: row.expires_at,
  };
}

async function put(challenge) {
  await db.query('delete from otp_challenges where phone = $1', [challenge.phone]);
  await db.query(
    `insert into otp_challenges (phone, code_hash, reset_token, attempts, sent_at, expires_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      challenge.phone,
      challenge.codeHash,
      challenge.resetToken || null,
      challenge.attempts || 0,
      challenge.sentAt,
      challenge.expiresAt,
    ]
  );
}

async function getByPhone(phone) {
  const { rows } = await db.query(
    'select * from otp_challenges where phone = $1 and expires_at > now()',
    [phone]
  );
  return toChallenge(rows[0]);
}

async function getByResetToken(token) {
  const { rows } = await db.query(
    'select * from otp_challenges where reset_token = $1 and expires_at > now()',
    [token]
  );
  return toChallenge(rows[0]);
}

async function update(phone, patch) {
  const { rows } = await db.query(
    `update otp_challenges
        set code_hash   = coalesce($2, code_hash),
            reset_token = coalesce($3, reset_token),
            attempts    = coalesce($4, attempts),
            expires_at  = coalesce($5, expires_at)
      where phone = $1
      returning *`,
    [
      phone,
      patch.codeHash === undefined ? null : patch.codeHash,
      patch.resetToken === undefined ? null : patch.resetToken,
      patch.attempts === undefined ? null : patch.attempts,
      patch.expiresAt === undefined ? null : patch.expiresAt,
    ]
  );
  return toChallenge(rows[0]);
}

async function remove(phone) {
  await db.query('delete from otp_challenges where phone = $1', [phone]);
}

module.exports = { put, getByPhone, getByResetToken, update, remove };
