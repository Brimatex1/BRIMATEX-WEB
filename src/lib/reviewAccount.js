// The account Apple's App Review signs in with (App Review notes in App Store
// Connect). Configured in .env on the server - both empty means no such account:
//
//   BRIMATEX_REVIEW_PHONE      the number given to the reviewer, as typed at sign-in
//   BRIMATEX_REVIEW_PASSWORD   its password - a secret: only in .env, never in a chat
//
// The account exists whenever the server runs: created at start-up if missing,
// and again right after the reviewer deletes it (they test deletion). Its
// orders never reach Odoo, delivery, Meta or WhatsApp - they are kept locally
// as demo orders, so "my orders" still shows them.

'use strict';

const auth = require('./auth');

const PHONE = String(process.env.BRIMATEX_REVIEW_PHONE || '').trim();
const PASSWORD = String(process.env.BRIMATEX_REVIEW_PASSWORD || '');
const NAME = 'مراجع App Store';

function isConfigured() {
  return Boolean(PHONE && PASSWORD.length >= 6);
}

/** Creates the account when it is missing. Never throws - a failure only logs. */
async function ensure() {
  if (!isConfigured()) return;
  try {
    if (await auth.findByPhone(PHONE)) return;
    await auth.createUser(PHONE, PASSWORD, NAME);
    console.log('[App Review] the review account was created');
  } catch (err) {
    console.error('[App Review] could not create the review account:', err.message);
  }
}

/** Whether this signed-in user is the review account. */
async function isReviewUser(userId) {
  if (!isConfigured() || !userId) return false;
  const user = await auth.getUser(userId);
  return Boolean(user && user.phone === PHONE);
}

module.exports = { isConfigured, ensure, isReviewUser };
