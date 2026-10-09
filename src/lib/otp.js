// One-time password codes for password recovery.
//
// Backed by Postgres when DATABASE_URL is set (store/pg-otp.js), otherwise by
// a local JSONL file (store/file-otp.js) — same API either way, chosen once at
// boot, exactly like src/lib/auth.js.
//
// The policy lives here rather than in the route so both storage backends and
// any future caller get the same rules.

const crypto = require('crypto');
const db = require('./db');
const { hashPassword, verifyPassword, generateToken } = require('./store/password');
const whatsapp = require('./whatsapp-cloud');

const backend = db.isConfigured() ? require('./store/pg-otp') : require('./store/file-otp');

/** The code is short-lived on purpose: a WhatsApp message can sit unread. */
const CODE_TTL_MS = 5 * 60 * 1000;
/** Time to choose a new password after the code was accepted. */
const RESET_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses before the challenge dies. 6 digits × 5 tries = 1 in 200,000. */
const MAX_ATTEMPTS = 5;
/** Stops "resend" from becoming a paid-message button. */
const RESEND_COOLDOWN_MS = 60 * 1000;

/** `crypto.randomInt` not `Math.random`: the code is a credential. */
function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Apple's reviewer (src/lib/reviewAccount.js) cannot receive WhatsApp on the
 * review number, yet must be able to test deleting the account, which asks for
 * a code. Their number alone gets the fixed code set in .env
 * (BRIMATEX_REVIEW_CODE, six digits, given to Apple in the App Review notes),
 * and nothing is sent. Any other number: a random code, by WhatsApp.
 */
function reviewCodeFor(phone) {
  const reviewPhone = String(process.env.BRIMATEX_REVIEW_PHONE || '').trim();
  const reviewCode = String(process.env.BRIMATEX_REVIEW_CODE || '');
  return reviewPhone && phone === reviewPhone && /^\d{6}$/.test(reviewCode) ? reviewCode : null;
}

/**
 * Issues a code and sends it. The caller must **not** vary its response by the
 * outcome: whether the phone has an account, whether the send succeeded, and
 * whether a cooldown is active all look identical from outside, or the endpoint
 * becomes a way to ask "does this number have an account here?".
 *
 * Returns { issued, reason } for logging only.
 */
async function requestCode(phone) {
  const existing = await backend.getByPhone(phone);
  if (existing && Date.now() - new Date(existing.sentAt).getTime() < RESEND_COOLDOWN_MS) {
    const waitMs = RESEND_COOLDOWN_MS - (Date.now() - new Date(existing.sentAt).getTime());
    return { issued: false, reason: 'cooldown', retryInSeconds: Math.ceil(waitMs / 1000) };
  }

  const fixed = reviewCodeFor(phone);
  const code = fixed || generateCode();
  const now = new Date();

  await backend.put({
    phone,
    codeHash: await hashPassword(code),
    resetToken: null,
    attempts: 0,
    sentAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
  });

  if (fixed) return { issued: true };

  const result = await whatsapp.sendOtp(phone, code);
  if (!result.sent) {
    // Nothing was delivered, so leaving the challenge behind would only block
    // the customer's next attempt for a minute.
    await backend.remove(phone);
    return { issued: false, reason: result.reason || 'send_failed' };
  }

  return { issued: true };
}

/**
 * Checks a code and, on success, returns a single-use token that authorises
 * one password change. Wrong guesses are counted; the fifth kills the
 * challenge so the customer has to request a fresh code.
 */
async function verifyCode(phone, code) {
  const challenge = await backend.getByPhone(phone);
  if (!challenge || !challenge.codeHash) return { ok: false, reason: 'expired' };

  if (challenge.attempts >= MAX_ATTEMPTS) {
    await backend.remove(phone);
    return { ok: false, reason: 'too_many_attempts' };
  }

  const { ok } = await verifyPassword(String(code || ''), challenge.codeHash);
  if (!ok) {
    await backend.update(phone, { attempts: challenge.attempts + 1 });
    return { ok: false, reason: 'wrong_code', attemptsLeft: Math.max(0, MAX_ATTEMPTS - (challenge.attempts + 1)) };
  }

  // The code is spent the moment it works: the row now carries only the reset
  // token, so the same code cannot be replayed.
  const resetToken = generateToken();
  await backend.update(phone, {
    codeHash: '',
    resetToken,
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
  });

  return { ok: true, resetToken };
}

/** Resolves the phone a reset token belongs to, and burns the token. */
async function consumeResetToken(token) {
  if (!token) return null;
  const challenge = await backend.getByResetToken(token);
  if (!challenge || !challenge.resetToken) return null;
  await backend.remove(challenge.phone);
  return challenge.phone;
}

module.exports = {
  RESEND_COOLDOWN_MS,
  requestCode,
  verifyCode,
  consumeResetToken,
  isDeliveryConfigured: whatsapp.isConfigured,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
};
