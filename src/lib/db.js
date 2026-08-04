// PostgreSQL connection + schema bootstrap.
//
// Accounts, sessions, addresses, wishlist and order history live here when
// DATABASE_URL is set. Without it, src/lib/auth.js and src/lib/orders.js fall
// back to the local JSONL files — see those modules.

const { Pool } = require('pg');

let pool = null;

function isConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!pool) {
    const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Managed providers (Neon/Supabase/Railway) terminate TLS with a cert
      // that isn't in Node's default trust store; a plain local Postgres
      // usually has no TLS configured at all.
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

const SCHEMA = `
create table if not exists users (
  id uuid primary key,
  phone text unique not null,
  email text,
  password_hash text not null,
  name text not null,
  role text not null default 'customer',
  odoo_partner_id integer,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_id_idx on sessions(user_id);

create table if not exists addresses (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  address text not null,
  city text not null,
  created_at timestamptz not null default now()
);
create index if not exists addresses_user_id_idx on addresses(user_id);

create table if not exists wishlist_items (
  user_id uuid not null references users(id) on delete cascade,
  product_id integer not null,
  added_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists orders (
  order_name text primary key,
  invoice_name text,
  user_id uuid references users(id) on delete set null,
  source text not null,
  customer jsonb not null,
  items jsonb not null,
  note text,
  total numeric not null default 0,
  invoice_status text not null default 'draft',
  payment_status text not null default 'unpaid',
  odoo_order_id integer,
  odoo_invoice_id integer,
  placed_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz
);
create index if not exists orders_user_id_idx on orders(user_id);
create index if not exists orders_placed_at_idx on orders(placed_at desc);

-- Admin overrides, keyed by product id. Independent of where the product
-- itself lives (demo catalogue or Odoo) — Odoo owns name/price/stock and
-- overwrites those on every sync, but never touches this table, so an
-- admin's icon/description/enabled choices for a product survive re-syncing it.
create table if not exists product_overrides (
  product_id integer primary key,
  icon_keys jsonb not null default '[]',
  description text,
  enabled boolean not null default true,
  image_url text,
  updated_at timestamptz not null default now()
);
alter table if exists product_overrides add column if not exists image_url text;
drop table if exists product_icon_features;
`;

let migrated = false;

/** Idempotent — safe to call on every boot. Runs once per process. */
async function migrate() {
  if (migrated || !isConfigured()) return;
  await query(SCHEMA);
  migrated = true;
}

module.exports = { isConfigured, getPool, query, migrate };
