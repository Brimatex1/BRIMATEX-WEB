/**
 * Loyalty: reward vouchers, points, and reviews - one balance per customer,
 * shared by the website and the iOS app.
 *
 * The rules are the app's (brimatex-ios/src/features/rewards.ts and points.ts)
 * - the same rewards, percentages, validity, points rate and redemption step.
 * Until now the app computed all of it on the phone, so each device kept its
 * own record: points could be redeemed once per device, and a voucher used in
 * the app still looked unused on the site. Here the server holds the record,
 * and a voucher or a point can be spent exactly once:
 *
 *   - redemption checks the balance under a per-customer lock (store);
 *   - a voucher is claimed with a unique row before the order is created in
 *     Odoo, released if creating the order fails, and tied to the order after.
 *
 * Change a rule here and in the app together.
 */
'use strict';

const crypto = require('crypto');
const db = require('./db');
const orders = require('./orders');
const auth = require('./auth');

const store = db.isConfigured() ? require('./store/pg-perks') : require('./store/file-perks');

/* ─────────────────────────── The app's rules ─────────────────────────── */

/** features/rewards.ts REWARDS - `discount` is a percentage. */
const REWARDS = [
  { key: 'first', title: 'أول طلب', body: 'أتممت أول طلب لك. قسيمة 5% على طلبك القادم.', icon: 'bag', target: 1, of: 'orders', discount: 5, validDays: 60 },
  { key: 'loyal', title: 'عميل وفيّ', body: 'ثلاثة طلبات مدفوعة. قسيمة 10% تنتظرك.', icon: 'heart', target: 3, of: 'paidOrders', discount: 10, validDays: 90 },
  { key: 'reviewer', title: 'صانع تقييمات', body: 'قيّم منتجاً اشتريته واحصل على 5%.', icon: 'star', target: 1, of: 'reviews', discount: 5, validDays: 60 },
  { key: 'bigheart', title: 'قلب كبير', body: 'خمسة منتجات في المفضّلة. قسيمة 5% للمقارنة الجادّة.', icon: 'cloud', target: 5, of: 'wishlist', discount: 5, validDays: 30 },
  { key: 'collector', title: 'جامع المراتب', body: 'خمسة طلبات. قسيمة 10% على المرتبة التالية.', icon: 'bed', target: 5, of: 'orders', discount: 10, validDays: 90 },
  { key: 'ten', title: '+10 طلبات', body: 'عشرة طلبات معنا. قسيمة 15% وشكرنا الكبير.', icon: 'happy', target: 10, of: 'orders', discount: 15, validDays: 120 },
];

/** features/points.ts */
const POINTS_PER_DINAR = 1;
const REDEEM_STEP_POINTS = 250;
const REDEEM_STEP_VALUE = 5; // LYD per step
const REDEEM_VALID_DAYS = 90;

const DAY_MS = 86_400_000;

/* ─────────────────────────────── Helpers ─────────────────────────────── */

const live = (o) => o.invoiceStatus !== 'cancel';
const isPaid = (o) => o.paymentStatus === 'paid';
const pointsForOrder = (o) => Math.floor(Math.max(0, Number(o.total) || 0) * POINTS_PER_DINAR);
const addDays = (iso, days) => new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
const round2 = (n) => Math.round(n * 100) / 100;

/** The short code a courier can read: BRX-FIRST-5 (features/rewards.ts codeFor). */
const rewardCode = (r) => `BRX-${r.key.toUpperCase()}-${r.discount}`;

function discountLabel(v) {
  return v.unit === '%' ? `خصم ${v.discount}%` : `خصم ${v.discount} د.ل`;
}

function stateOf(v, now = Date.now()) {
  if (v.usedAt) return 'used';
  if (new Date(v.validUntil).getTime() < now) return 'expired';
  return 'active';
}

/* ─────────────────────────────── Reading ─────────────────────────────── */

/**
 * Everything a customer's loyalty screens show, computed from their orders,
 * wishlist and reviews. Records the unlock date of every reward that has just
 * completed - a voucher's validity counts from that day.
 */
async function summaryFor(userId) {
  const [userOrders, user, reviews, unlocks, redemptions, uses] = await Promise.all([
    orders.listOrdersForUser(userId),
    auth.getUser(userId),
    store.listReviews(userId),
    store.listUnlocks(userId),
    store.listRedemptions(userId),
    store.listUses(userId),
  ]);

  const liveOrders = userOrders.filter(live);
  const signals = {
    orders: liveOrders.length,
    paidOrders: liveOrders.filter(isPaid).length,
    reviews: reviews.length,
    wishlist: Array.isArray(user?.wishlist) ? user.wishlist.length : 0,
  };

  const progress = REWARDS.map((r) => {
    const value = Math.min(r.target, signals[r.of]);
    return { ...r, value, ratio: value / r.target, complete: value >= r.target };
  });

  const unlockedAt = Object.fromEntries(unlocks.map((u) => [u.rewardKey, u.unlockedAt]));
  const now = new Date().toISOString();
  const newlyUnlocked = [];
  for (const p of progress) {
    if (p.complete && !unlockedAt[p.key]) {
      await store.addUnlock(userId, p.key, now);
      unlockedAt[p.key] = now;
      newlyUnlocked.push(p.key);
    }
  }

  const usedAt = Object.fromEntries(uses.map((u) => [u.code, u.usedAt]));

  const rewardVouchers = progress
    .filter((p) => unlockedAt[p.key])
    .map((p) => ({
      code: rewardCode(p),
      title: p.title,
      body: `خصم ${p.discount}% على طلبك القادم`,
      discount: p.discount,
      unit: '%',
      icon: p.icon,
      unlockedAt: unlockedAt[p.key],
      validUntil: addDays(unlockedAt[p.key], p.validDays),
      usedAt: usedAt[rewardCode(p)],
    }));

  const pointVouchers = redemptions.map((r) => ({
    code: r.code,
    title: 'استبدال نقاط',
    body: `خصم ${r.value} د.ل من طلبك القادم`,
    discount: r.value,
    unit: 'د.ل',
    icon: 'star',
    unlockedAt: r.createdAt,
    validUntil: addDays(r.createdAt, REDEEM_VALID_DAYS),
    usedAt: usedAt[r.code],
  }));

  const vouchers = [...pointVouchers, ...rewardVouchers]
    .map((v) => ({ ...v, state: stateOf(v) }))
    .sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));

  const paid = liveOrders.filter(isPaid);
  const open = liveOrders.filter((o) => !isPaid(o));
  const earned = paid.reduce((n, o) => n + pointsForOrder(o), 0);
  const redeemed = redemptions.reduce((n, r) => n + r.points, 0);
  const ledger = [
    ...paid.map((o) => ({
      id: `earn:${o.orderName}`,
      label: `طلب ${o.orderName}`,
      points: pointsForOrder(o),
      at: o.paidAt || o.placedAt,
      orderName: o.orderName,
    })),
    ...redemptions.map((r) => ({
      id: `redeem:${r.code}`,
      label: `استبدال بقسيمة ${r.value} د.ل`,
      points: -r.points,
      at: r.createdAt,
    })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return {
    points: {
      earned,
      pending: open.reduce((n, o) => n + pointsForOrder(o), 0),
      redeemed,
      balance: Math.max(0, earned - redeemed),
      ledger,
      rules: { perDinar: POINTS_PER_DINAR, stepPoints: REDEEM_STEP_POINTS, stepValue: REDEEM_STEP_VALUE, validDays: REDEEM_VALID_DAYS },
    },
    progress: progress.map(({ key, title, body, icon, target, value, ratio, complete, discount }) => ({
      key, title, body, icon, target, value, ratio, complete, discount,
    })),
    vouchers,
    newlyUnlocked,
  };
}

/* ─────────────────────────────── Points ─────────────────────────────── */

/**
 * Turns points into a dinar voucher - whole steps only, within the balance.
 * The balance is re-checked by the store under a per-customer lock, so two
 * redemptions at once (the app and the site) cannot both spend it.
 */
async function redeemPoints(userId, requested) {
  const steps = Math.floor(Number(requested) / REDEEM_STEP_POINTS);
  if (!Number.isFinite(steps) || steps < 1) {
    return { error: `الاستبدال يكون بمضاعفات ${REDEEM_STEP_POINTS} نقطة` };
  }
  const userOrders = await orders.listOrdersForUser(userId);
  const earned = userOrders.filter(live).filter(isPaid).reduce((n, o) => n + pointsForOrder(o), 0);

  const redemption = await store.addRedemption(userId, earned, {
    code: `BRX-PTS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    points: steps * REDEEM_STEP_POINTS,
    value: steps * REDEEM_STEP_VALUE,
    createdAt: new Date().toISOString(),
  });
  if (!redemption) return { error: 'رصيد النقاط لا يكفي' };
  return { redemption };
}

/* ─────────────────────────────── Vouchers ─────────────────────────────── */

/** The customer's voucher with this code if it can be used now, or an error. */
async function findActiveVoucher(userId, code) {
  const wanted = String(code || '').trim().toUpperCase();
  if (!wanted) return { error: 'رمز القسيمة مطلوب' };
  const { vouchers } = await summaryFor(userId);
  const voucher = vouchers.find((v) => v.code === wanted);
  if (!voucher) return { error: 'القسيمة غير موجودة في حسابك' };
  if (voucher.state === 'used') return { error: 'استُخدمت هذه القسيمة من قبل' };
  if (voucher.state === 'expired') return { error: 'انتهت صلاحية هذه القسيمة' };
  return { voucher };
}

/** The discount a voucher gives on a subtotal - never more than the subtotal. */
function discountAmount(voucher, subtotal) {
  const base = Math.max(0, Number(subtotal) || 0);
  const amount = voucher.unit === '%' ? (base * voucher.discount) / 100 : voucher.discount;
  return round2(Math.min(base, amount));
}

/**
 * Reserves a voucher for an order about to be created. False when it is
 * already reserved or used - the store's unique row settles a race between
 * two orders at once.
 */
function claimVoucher(userId, code) {
  return store.claimUse(userId, code, new Date().toISOString());
}

/** Gives a reserved voucher back when the order could not be created. */
function releaseVoucher(userId, code) {
  return store.releaseUse(userId, code);
}

/** Ties a used voucher to the order it was spent on. */
function attachVoucherToOrder(userId, code, orderName) {
  return store.setUseOrder(userId, code, orderName);
}

/* ─────────────────────────────── Reviews ─────────────────────────────── */

async function listReviews(userId) {
  return store.listReviews(userId);
}

/**
 * A review of something the customer bought: the order must be theirs. One
 * review per product per order - the reviewer reward cannot be farmed.
 */
async function addReview(userId, { productId, orderName, rating, comment }) {
  const pid = Number(productId);
  const stars = Number(rating);
  const name = String(orderName || '').trim();
  if (!Number.isInteger(pid) || pid <= 0) return { error: 'منتج غير صالح' };
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: 'التقييم من 1 إلى 5' };
  const order = (await orders.listOrdersForUser(userId)).find((o) => o.orderName === name);
  if (!order) return { error: 'الطلب غير موجود في حسابك' };

  const review = {
    id: crypto.randomUUID(),
    productId: pid,
    orderName: name,
    rating: stars,
    comment: String(comment || '').trim().slice(0, 1000),
    createdAt: new Date().toISOString(),
  };
  const added = await store.addReview(userId, review);
  if (!added) return { error: 'قيّمت هذا المنتج في هذا الطلب من قبل' };
  return { review };
}

module.exports = {
  REWARDS,
  POINTS_PER_DINAR,
  REDEEM_STEP_POINTS,
  REDEEM_STEP_VALUE,
  REDEEM_VALID_DAYS,
  summaryFor,
  redeemPoints,
  findActiveVoucher,
  discountAmount,
  discountLabel,
  claimVoucher,
  releaseVoucher,
  attachVoucherToOrder,
  listReviews,
  addReview,
};
