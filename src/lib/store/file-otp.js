// File-backed OTP challenges (JSONL). Used when DATABASE_URL is not set —
// see src/lib/otp.js, which picks this or store/pg-otp.js.
//
// One live challenge per phone: requesting a new code replaces the old one, so
// the file stays the size of "people mid-recovery right now", not a history.

const fs = require('fs');
const path = require('path');

const OTP_FILE = path.join(__dirname, '..', '..', 'data', 'otp.jsonl');

function readAll() {
  try {
    if (!fs.existsSync(OTP_FILE)) return [];
    return fs
      .readFileSync(OTP_FILE, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function writeAll(rows) {
  // Expired rows are dropped on every write — no separate cleanup job.
  const live = rows.filter((r) => new Date(r.expiresAt).getTime() > Date.now());
  fs.writeFileSync(OTP_FILE, live.length ? live.map((r) => JSON.stringify(r)).join('\n') + '\n' : '');
}

async function put(challenge) {
  const rows = readAll().filter((r) => r.phone !== challenge.phone);
  rows.push(challenge);
  writeAll(rows);
}

async function getByPhone(phone) {
  const row = readAll().find((r) => r.phone === phone);
  if (!row) return null;
  return new Date(row.expiresAt).getTime() > Date.now() ? row : null;
}

async function getByResetToken(token) {
  const row = readAll().find((r) => r.resetToken && r.resetToken === token);
  if (!row) return null;
  return new Date(row.expiresAt).getTime() > Date.now() ? row : null;
}

async function update(phone, patch) {
  const rows = readAll();
  const i = rows.findIndex((r) => r.phone === phone);
  if (i === -1) return null;
  rows[i] = { ...rows[i], ...patch };
  writeAll(rows);
  return rows[i];
}

async function remove(phone) {
  writeAll(readAll().filter((r) => r.phone !== phone));
}

module.exports = { put, getByPhone, getByResetToken, update, remove };
