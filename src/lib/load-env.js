// Minimal .env loader — nothing in this project read .env before, so setting
// DATABASE_URL (or ODOO_*, ADMIN_PHONES, TWILIO_*) there had no effect unless
// the shell exported it separately. Loaded first thing in src/server.js and
// scripts/migrate-to-postgres.js, before anything reads process.env.
//
// Real environment variables always win — a value already set in the process
// environment is never overwritten by the file.

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const file = path.join(__dirname, '..', '..', '.env');
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();
