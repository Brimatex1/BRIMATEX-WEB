// Postgres-backed loyalty records (src/lib/perks.js). Used when DATABASE_URL
// is set; store/file-perks.js otherwise. Written for PostgreSQL 9.2 - no
// "on conflict": duplicates surface as unique_violation (23505) and are
// answered as "already there".

const db = require('../db');

const UNIQUE_VIOLATION = '23505';

async function listUnlocks(userId) {
  const { rows } = await db.query(
    'select reward_key, unlocked_at from perk_unlocks where user_id = $1',
    [userId]
  );
  return rows.map((r) => ({ rewardKey: r.reward_key, unlockedAt: new Date(r.unlocked_at).toISOString() }));
}

async function addUnlock(userId, rewardKey, unlockedAt) {
  try {
    await db.query('insert into perk_unlocks (user_id, reward_key, unlocked_at) values ($1, $2, $3)', [
      userId,
      rewardKey,
      unlockedAt,
    ]);
  } catch (err) {
    // Two requests unlocking the same reward at once: the first date stands.
    if (err.code !== UNIQUE_VIOLATION) throw err;
  }
}

async function listRedemptions(userId) {
  const { rows } = await db.query(
    'select code, points, value, created_at from point_redemptions where user_id = $1 order by created_at desc',
    [userId]
  );
  return rows.map((r) => ({
    code: r.code,
    points: Number(r.points),
    value: Number(r.value),
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/**
 * Records a redemption if the balance allows it, or returns null. The check
 * and the insert run in one transaction under an advisory lock keyed on the
 * customer, so concurrent redemptions - the app and the site, or several
 * server processes - are serialised and cannot overspend.
 */
async function addRedemption(userId, earned, redemption) {
  const client = await db.getPool().connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`points:${userId}`]);
    const { rows } = await client.query(
      'select coalesce(sum(points), 0) as spent from point_redemptions where user_id = $1',
      [userId]
    );
    if (earned - Number(rows[0].spent) < redemption.points) {
      await client.query('rollback');
      return null;
    }
    await client.query(
      'insert into point_redemptions (code, user_id, points, value, created_at) values ($1, $2, $3, $4, $5)',
      [redemption.code, userId, redemption.points, redemption.value, redemption.createdAt]
    );
    await client.query('commit');
    return redemption;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function listUses(userId) {
  const { rows } = await db.query(
    'select code, order_name, used_at from voucher_uses where user_id = $1',
    [userId]
  );
  return rows.map((r) => ({ code: r.code, orderName: r.order_name, usedAt: new Date(r.used_at).toISOString() }));
}

/** False when the voucher is already claimed or used. */
async function claimUse(userId, code, usedAt) {
  try {
    await db.query('insert into voucher_uses (user_id, code, used_at) values ($1, $2, $3)', [userId, code, usedAt]);
    return true;
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) return false;
    throw err;
  }
}

/** Only an unfinished claim (no order yet) can be released. */
async function releaseUse(userId, code) {
  await db.query('delete from voucher_uses where user_id = $1 and code = $2 and order_name is null', [userId, code]);
}

async function setUseOrder(userId, code, orderName) {
  await db.query('update voucher_uses set order_name = $3 where user_id = $1 and code = $2', [userId, code, orderName]);
}

async function listReviews(userId) {
  const { rows } = await db.query(
    'select id, product_id, order_name, rating, comment, created_at from reviews where user_id = $1 order by created_at desc',
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    orderName: r.order_name,
    rating: r.rating,
    comment: r.comment,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** Every review, with its author and whether it is hidden - newest first. */
async function listAllReviews() {
  const { rows } = await db.query(
    'select id, user_id, product_id, order_name, rating, comment, created_at, hidden from reviews order by created_at desc'
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    productId: r.product_id,
    orderName: r.order_name,
    rating: r.rating,
    comment: r.comment,
    createdAt: new Date(r.created_at).toISOString(),
    hidden: r.hidden,
  }));
}

/** False when there is no such review. */
async function setReviewHidden(id, hidden) {
  const { rowCount } = await db.query('update reviews set hidden = $2 where id = $1', [id, hidden]);
  return rowCount > 0;
}

/** False when this product in this order is already reviewed. */
async function addReview(userId, review) {
  try {
    await db.query(
      'insert into reviews (id, user_id, product_id, order_name, rating, comment, created_at) values ($1, $2, $3, $4, $5, $6, $7)',
      [review.id, userId, review.productId, review.orderName, review.rating, review.comment, review.createdAt]
    );
    return true;
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) return false;
    throw err;
  }
}

module.exports = {
  listUnlocks,
  addUnlock,
  listRedemptions,
  addRedemption,
  listUses,
  claimUse,
  releaseUse,
  setUseOrder,
  listReviews,
  addReview,
  listAllReviews,
  setReviewHidden,
};
