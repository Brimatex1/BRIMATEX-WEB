// File-backed push-device registry (JSONL). Used when DATABASE_URL is not set —
// see src/lib/devices.js, which picks this or store/pg-devices.js.
//
// One row per device token. A token is re-registered on every order, so the
// row is replaced rather than appended: the file stays the size of "phones
// that have the app", not "orders ever placed".

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'devices.jsonl');

function readAll() {
  try {
    if (!fs.existsSync(FILE)) return [];
    return fs
      .readFileSync(FILE, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function writeAll(rows) {
  fs.writeFileSync(FILE, rows.length ? rows.map((r) => JSON.stringify(r)).join('\n') + '\n' : '');
}

async function register({ token, platform, userId, orderName }) {
  const rows = readAll().filter((r) => r.token !== token);
  rows.push({
    token,
    platform,
    userId: userId || null,
    // Lets a guest who ordered without an account still be told when that one
    // order moves. Overwritten by their next order, which is what we want.
    lastOrder: orderName || null,
    registeredAt: new Date().toISOString(),
  });
  writeAll(rows);
}

/** Every device that should hear about this order — its owner's, plus the guest device that placed it. */
async function findForOrder({ userId, orderName }) {
  return readAll().filter(
    (r) => (userId && r.userId === userId) || (orderName && r.lastOrder === orderName)
  );
}

/** Expo tells us when a token is dead; keeping it only wastes later requests. */
async function remove(token) {
  writeAll(readAll().filter((r) => r.token !== token));
}

module.exports = { register, findForOrder, remove };
