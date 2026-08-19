#!/usr/bin/env node
/**
 * BRIMATEX — PostgreSQL 9.2 compatibility guard (zero dependencies).
 *
 * The production database is PostgreSQL 9.2.24 on the cPanel host. It predates
 * a lot of SQL this project would otherwise reach for, and the failure mode is
 * brutal: the schema runs on every boot, so one unsupported keyword takes the
 * whole site down rather than failing quietly. This check fails the build
 * instead.
 *
 * It also guards src/lib/no-undici.js, which must be the first require in the
 * server and in anything that loads `pg` — without it, `require('pg')` pulls in
 * undici, whose WebAssembly parser this host cannot instantiate.
 *
 * If the host ever moves to a modern PostgreSQL, delete this file and the
 * `on conflict` / `jsonb` spellings become fair game again.
 *
 * Run:  node tests/postgres92.check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    const line = detail ? `${name} — ${detail}` : name;
    failures.push(line);
    console.log(`  \x1b[31m✗\x1b[0m ${line}`);
  }
}

/** Files that talk to Postgres. Anything added here is checked too. */
const SQL_FILES = [
  'src/lib/db.js',
  'scripts/migrate-to-postgres.js',
  'src/lib/store/pg-auth.js',
  'src/lib/store/pg-orders.js',
  'src/lib/store/pg-product-overrides.js',
].filter((rel) => fs.existsSync(path.join(root, rel)));

/** [name, pattern, minimum version that supports it] */
const TOO_NEW = [
  ['jsonb', /\bjsonb\b/i, '9.4'],
  ['on conflict', /\bon\s+conflict\b/i, '9.5'],
  ['create index if not exists', /create\s+index\s+(concurrently\s+)?if\s+not\s+exists/i, '9.5'],
  ['add column if not exists', /add\s+column\s+if\s+not\s+exists/i, '9.6'],
  ['generated … as identity', /generated\s+(always|by\s+default)\s+as\s+identity/i, '10'],
  ['gen_random_uuid()', /\bgen_random_uuid\s*\(/i, '13 (أو pgcrypto)'],
];

console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — توافق PostgreSQL 9.2 ═══\x1b[0m');

console.log('\n\x1b[1m1. صيغ SQL أحدث من 9.2\x1b[0m');
for (const rel of SQL_FILES) {
  const source = read(rel);
  // Comments explain *why* these are avoided, so they must not trip the check.
  const code = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');

  for (const [label, pattern, since] of TOO_NEW) {
    check(`${rel}: بلا ${label} (يحتاج ${since})`, !pattern.test(code));
  }
}

console.log('\n\x1b[1m2. حارس undici\x1b[0m');
check('src/lib/no-undici.js موجود', fs.existsSync(path.join(root, 'src/lib/no-undici.js')));

for (const [rel, spec] of [
  ['src/server.js', './lib/no-undici'],
  ['scripts/migrate-to-postgres.js', '../src/lib/no-undici'],
  ['scripts/diag-pg.js', '../src/lib/no-undici'],
]) {
  if (!fs.existsSync(path.join(root, rel))) continue;

  const requires = [...read(rel).matchAll(/^require\((['"])(.+?)\1\);/gm)].map((m) => m[2]);
  check(
    `${rel}: يستدعي no-undici قبل أي شيء آخر`,
    requires[0] === spec,
    requires.length ? `أول استدعاء: ${requires[0]}` : 'لا يوجد استدعاء في المستوى الأعلى'
  );
}

// Deleting the globals is the point: pg's Cloudflare sniff *constructs*
// Response, so a stub that throws would still crash the app.
const guard = read('src/lib/no-undici.js');
check('الحارس يحذف الكائنات (لا يستبدلها بدالة ترمي خطأ)', /delete globalThis\[name\]/.test(guard));

/* ---------- report ---------- */

console.log('\n' + '─'.repeat(52));
console.log(
  `\x1b[1mالنتيجة:\x1b[0m ${fail === 0 ? '\x1b[32m' : ''}${pass} ناجح\x1b[0m / ${pass + fail}` +
    (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : '')
);
if (fail) {
  console.log('\n\x1b[31mالفاشل:\x1b[0m');
  failures.forEach((f) => console.log('  • ' + f));
}
console.log('─'.repeat(52));

process.exit(fail === 0 ? 0 : 1);
