#!/usr/bin/env node
// One-off: copies existing local accounts/orders (src/data/*.jsonl) into the
// PostgreSQL database configured by DATABASE_URL. Safe to re-run — existing
// rows are left untouched.
//
// The inserts use "where not exists" rather than "on conflict do nothing":
// the production database is PostgreSQL 9.2, which predates ON CONFLICT (9.5).
// Casts are explicit because a SELECT-fed insert gives the planner no column
// to infer each parameter's type from, the way VALUES does.
//
// Run:  npm run migrate:pg

const fs = require('fs');
const path = require('path');

require('../src/lib/no-undici');
require('../src/lib/load-env');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL غير مضبوط — أضفه إلى .env أولاً (راجع docs/POSTGRES_SETUP.md)');
  process.exit(1);
}

const db = require('../src/lib/db');

const USERS_FILE = path.join(__dirname, '..', 'src', 'data', 'users.jsonl');
const ORDERS_FILE = path.join(__dirname, '..', 'src', 'data', 'orders.local.jsonl');

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function migrateUsers() {
  const users = readJsonl(USERS_FILE);
  let inserted = 0;

  for (const u of users) {
    const { rowCount } = await db.query(
      `insert into users (id, phone, email, password_hash, name, role, created_at)
       select $1::uuid, $2, $3, $4, $5, $6, $7::timestamptz
       where not exists (select 1 from users where id = $1::uuid)`,
      [u.id, u.phone, u.email, u.passwordHash, u.name, u.role || 'customer', u.createdAt]
    );
    inserted += rowCount;

    for (const a of u.addresses || []) {
      await db.query(
        `insert into addresses (id, user_id, address, city, created_at)
         select $1, $2::uuid, $3, $4, $5::timestamptz
         where not exists (select 1 from addresses where id = $1)`,
        [a.id, u.id, a.address, a.city, a.createdAt]
      );
    }
    for (const w of u.wishlist || []) {
      await db.query(
        `insert into wishlist_items (user_id, product_id, added_at)
         select $1::uuid, $2::integer, $3::timestamptz
         where not exists (
           select 1 from wishlist_items
           where user_id = $1::uuid and product_id = $2::integer
         )`,
        [u.id, w.productId, w.addedAt]
      );
    }
  }

  console.log(`المستخدمون: ${inserted} من أصل ${users.length} (والباقي كان موجوداً بالفعل)`);
}

async function migrateOrders() {
  const orders = readJsonl(ORDERS_FILE);
  const { rows: userRows } = await db.query('select id from users');
  const validUserIds = new Set(userRows.map((r) => r.id));
  let inserted = 0;
  let skipped = 0;

  for (const o of orders) {
    // A handful of legacy lines in this file are stray session records, not
    // orders (a pre-existing data mix-up, not something to migrate).
    if (!o.orderName) {
      skipped++;
      continue;
    }
    // An order can reference an account that no longer exists in the file
    // (deleted/edited by hand at some point) — keep the order, drop the link.
    const userId = o.userId && validUserIds.has(o.userId) ? o.userId : null;
    const { rowCount } = await db.query(
      `insert into orders
         (order_name, invoice_name, user_id, source, customer, items, note, total,
          invoice_status, payment_status, odoo_order_id, odoo_invoice_id, placed_at, paid_at)
       select $1, $2, $3::uuid, $4, $5::json, $6::json, $7, $8::numeric,
              $9, $10, $11::integer, $12::integer, $13::timestamptz, $14::timestamptz
       where not exists (select 1 from orders where order_name = $1)`,
      [
        o.orderName,
        o.invoiceName || null,
        userId,
        o.source || 'demo',
        JSON.stringify(o.customer || {}),
        JSON.stringify(o.items || []),
        o.note || null,
        o.total || 0,
        o.invoiceStatus || 'draft',
        o.paymentStatus || 'unpaid',
        o.odooOrderId || null,
        o.odooInvoiceId || null,
        o.placedAt || o.receivedAt || new Date().toISOString(),
        o.paidAt || null,
      ]
    );
    inserted += rowCount;
  }

  console.log(
    `الطلبات: ${inserted} من أصل ${orders.length} (والباقي كان موجوداً بالفعل${skipped ? `، وتم تجاهل ${skipped} سجل تالف` : ''})`
  );
}

async function main() {
  await db.migrate();
  await migrateUsers();
  await migrateOrders();
  await db.getPool().end();
  console.log('تمت الترحلة.');
}

main().catch((err) => {
  console.error('فشلت الترحلة:', err.message);
  // Some hosts only surface the exit code from the dashboard's "run script"
  // button, not stdout/stderr — write the full error somewhere readable
  // from File Manager instead of requiring a terminal.
  try {
    fs.writeFileSync(
      path.join(__dirname, '..', 'src', 'data', 'migrate-error.log'),
      `${new Date().toISOString()}\n${err.stack || err.message}\n`
    );
  } catch {
    // Best-effort — the console.error above is the fallback.
  }
  process.exit(1);
});
