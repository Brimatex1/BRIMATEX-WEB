// File-backed loyalty records (src/lib/perks.js). Used when DATABASE_URL is
// not set; store/pg-perks.js otherwise. One JSON file with four lists.
//
// Every read-check-write below runs synchronously, with no await in between,
// so within the single Node process that serves the file store it cannot
// interleave with another request - the file store's equivalent of the
// Postgres lock and unique keys.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'perks.json');

function read() {
  try {
    if (!fs.existsSync(FILE)) return { unlocks: [], redemptions: [], uses: [], reviews: [] };
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return {
      unlocks: data.unlocks || [],
      redemptions: data.redemptions || [],
      uses: data.uses || [],
      reviews: data.reviews || [],
    };
  } catch {
    return { unlocks: [], redemptions: [], uses: [], reviews: [] };
  }
}

function write(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data));
}

const strip = ({ userId, ...rest }) => rest;

async function listUnlocks(userId) {
  return read().unlocks.filter((u) => u.userId === userId).map(strip);
}

async function addUnlock(userId, rewardKey, unlockedAt) {
  const data = read();
  if (data.unlocks.some((u) => u.userId === userId && u.rewardKey === rewardKey)) return;
  data.unlocks.push({ userId, rewardKey, unlockedAt });
  write(data);
}

async function listRedemptions(userId) {
  return read()
    .redemptions.filter((r) => r.userId === userId)
    .map(strip)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function addRedemption(userId, earned, redemption) {
  const data = read();
  const spent = data.redemptions.filter((r) => r.userId === userId).reduce((n, r) => n + r.points, 0);
  if (earned - spent < redemption.points) return null;
  data.redemptions.push({ userId, ...redemption });
  write(data);
  return redemption;
}

async function listUses(userId) {
  return read().uses.filter((u) => u.userId === userId).map(strip);
}

async function claimUse(userId, code, usedAt) {
  const data = read();
  if (data.uses.some((u) => u.userId === userId && u.code === code)) return false;
  data.uses.push({ userId, code, orderName: null, usedAt });
  write(data);
  return true;
}

async function releaseUse(userId, code) {
  const data = read();
  data.uses = data.uses.filter((u) => !(u.userId === userId && u.code === code && !u.orderName));
  write(data);
}

async function setUseOrder(userId, code, orderName) {
  const data = read();
  const use = data.uses.find((u) => u.userId === userId && u.code === code);
  if (use) {
    use.orderName = orderName;
    write(data);
  }
}

async function listReviews(userId) {
  return read()
    .reviews.filter((r) => r.userId === userId)
    .map(strip)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function addReview(userId, review) {
  const data = read();
  if (data.reviews.some((r) => r.userId === userId && r.productId === review.productId && r.orderName === review.orderName)) {
    return false;
  }
  data.reviews.push({ userId, ...review });
  write(data);
  return true;
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
};
