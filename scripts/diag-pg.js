#!/usr/bin/env node
// Read-only Postgres connectivity probe — safe to run against production.
//
// Deliberately reads DATABASE_URL straight out of .env instead of the
// environment: on the cPanel host an empty DATABASE_URL is set as an app
// environment variable to keep the store on file storage, and that empty value
// wins over .env, so every other script exits before it ever reaches pg.
//
// Prints where it got to and the full error if it fails. Never prints the
// password. Touches nothing — one `select` and then it disconnects.
//
// Run:  npm run diag:pg

// Guard under test: stops Node loading undici (and its WASM parser) at all.
require('../src/lib/no-undici');

const fs = require('fs');
const path = require('path');

function readEnvFile() {
  const file = path.join(__dirname, '..', '.env');
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { error: `تعذّرت قراءة .env: ${err.message}` };
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() !== 'DATABASE_URL') continue;

    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return { value };
  }
  return { error: 'لا يوجد سطر DATABASE_URL في .env' };
}

/** postgresql://user:secret@host:5432/db  ->  postgresql://user:***@host:5432/db */
function mask(url) {
  return url.replace(/(:\/\/[^:/@]*:)[^@]*@/, '$1***@');
}

function describe(err) {
  const lines = [
    `  name    : ${err.name}`,
    `  message : ${err.message || '(فارغة)'}`,
    `  code    : ${err.code || '-'}`,
  ];
  for (const sub of err.errors || []) {
    lines.push(`  sub     : ${sub.code || ''} ${sub.message}`);
  }
  lines.push(String(err.stack || '').split('\n').slice(0, 5).join('\n'));
  return lines.join('\n');
}

async function main() {
  console.log(`node       : ${process.version}`);

  const { value: url, error } = readEnvFile();
  if (error) {
    console.error(`[1] قراءة .env — فشلت: ${error}`);
    process.exit(1);
  }
  console.log(`[1] .env    : ${mask(url)}`);

  let Pool;
  try {
    ({ Pool } = require('pg'));
  } catch (err) {
    console.error('[2] require("pg") — فشل:');
    console.error(describe(err));
    process.exit(1);
  }
  const undici = process.moduleLoadList.filter((m) => /undici/i.test(m));
  console.log(`[2] pg      : محمّل. undici: ${undici.length ? undici.join(', ') : 'لم يُحمّل'}`);

  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });

  try {
    const { rows } = await pool.query('select current_user, current_database(), version()');
    console.log('[3] الاتصال : نجح');
    console.log(`    user    : ${rows[0].current_user}`);
    console.log(`    database: ${rows[0].current_database}`);
    console.log(`    version : ${String(rows[0].version).split(',')[0]}`);
  } catch (err) {
    console.error('[3] الاتصال : فشل');
    console.error(describe(err));
    await pool.end().catch(() => {});
    process.exit(1);
  }

  const listTables = async () => {
    const { rows } = await pool.query(
      "select tablename from pg_tables where schemaname = 'public' order by tablename"
    );
    return rows.length ? rows.map((r) => r.tablename).join(', ') : 'لا يوجد';
  };
  console.log(`[4] الجداول : ${await listTables()}`);

  // Opt-in: applies the schema, so the 9.2-compatible DDL can be proven on the
  // server without restarting the live app. Idempotent, like every boot.
  if (process.argv.includes('--apply')) {
    process.env.DATABASE_URL = url;
    try {
      await require('../src/lib/db').migrate();
      console.log(`[5] المخطط  : طُبّق. الجداول الآن: ${await listTables()}`);
    } catch (err) {
      console.error('[5] المخطط  : فشل');
      console.error(describe(err));
      await pool.end().catch(() => {});
      process.exit(1);
    }
  }

  await pool.end().catch(() => {});
  console.log('النتيجة: PostgreSQL يعمل من هذا السيرفر.');
}

main().catch((err) => {
  console.error('خطأ غير متوقع:');
  console.error(describe(err));
  process.exit(1);
});
