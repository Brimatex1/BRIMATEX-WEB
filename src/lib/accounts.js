/**
 * Erasing an account for good - the same steps whether the customer deletes it
 * themselves (DELETE /api/auth/me) or an admin does from the panel's
 * المستخدمون (DELETE /api/panel/accounts/:id).
 */
'use strict';

const auth = require('./auth');
const orders = require('./orders');
const avatar = require('./avatar');
const perks = require('./perks');
const devices = require('./devices');
const reviewAccount = require('./reviewAccount');

/** True when the account was there and is gone. */
async function eraseAccount(user) {
  // The orders stay, without who placed them (the owner's call): the record
  // with the customer's details stays in Odoo, never touched from here.
  await orders.forgetCustomer(user.id, user.phone);
  // The file store has no cascade: its reviews, points records and devices
  // go explicitly (Postgres drops them with the user row).
  await perks.forgetUser(user.id);
  await devices.forgetUser(user.id);
  const deleted = await auth.deleteUser(user.id);
  // Their photo goes with the account.
  if (deleted && user.avatarUrl) avatar.remove(user.avatarUrl);
  // Apple's reviewer tests deletion: their account comes straight back, empty.
  if (deleted) await reviewAccount.ensure();
  return deleted;
}

module.exports = { eraseAccount };
