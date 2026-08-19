# PostgreSQL Setup

This guide explains how to move accounts, sessions, addresses, wishlist and order
history onto a real PostgreSQL database.

## القاعدة الملزمة: توافق PostgreSQL 9.2

الإنتاج على brimatex.ly يعمل على **PostgreSQL 9.2.24** (استضافة cPanel من Libyan
Spider). أي SQL جديد في هذا المشروع يجب أن يبقى ضمن ما تدعمه 9.2 — والخطأ هنا
لا يظهر بهدوء: المخطط يُنفَّذ عند كل إقلاع، فكلمة غير مدعومة توقف الموقع كله.

| ممنوع | البديل المستخدم هنا |
|-------|---------------------|
| `jsonb` (9.4+) | `json` |
| `on conflict` (9.5+) | `insert … select … where not exists`، أو `update` ثم `insert` عند `rowCount === 0` |
| `create index if not exists` (9.5+) | كتلة `do $$ … pg_class … $$` |
| `add column if not exists` (9.6+) | كتلة `do $$ … information_schema.columns … $$` |
| `generated as identity` (10+) | `serial` أو معرّف يولّده التطبيق |
| `gen_random_uuid()` (13+) | يولّده التطبيق |

`npm test` يفرض هذه القاعدة عبر `tests/postgres92.check.js`، ويفحص أيضاً أن
`src/lib/no-undici.js` هو أول استدعاء في الخادم وفي كل سكربت يحمّل `pg` —
بدونه ينهار التطبيق لأن هذه الاستضافة لا تشغّل WebAssembly.

للتشخيص على الإنتاج بلا أي توقّف: cPanel ← Setup Node.js App ← Run JS script ←
`diag:pg` (وبمعامل `--apply` يطبّق المخطط).

إن انتقلت الاستضافة إلى إصدار أحدث، احذف `tests/postgres92.check.js` وتصير
الصيغ الحديثة متاحة.

## Overview

The store keeps two kinds of data in two different places:

- **Odoo** (optional, configured from the admin dashboard) — the product catalogue
  and sale orders / invoices. This is unaffected by this guide.
- **Accounts and order history** — customer accounts, passwords, sessions,
  addresses, wishlists, and every order placed (whether or not Odoo is
  connected). This is what moves into Postgres.

When an order is placed while Odoo is connected, it is now saved in **both**
places automatically: created in Odoo as before, and saved locally with the
Odoo order/invoice id attached, so "my orders" and the admin dashboard always
show it. A customer's Odoo partner id is also remembered on their account after
their first order, so repeat orders map to the same Odoo partner.

## Configuration

### Option 1: Local files (default, no setup needed)

Leave `DATABASE_URL` empty in `.env`. Accounts and orders are kept in
`src/data/*.jsonl` — this is what the project already does, and what runs in
CI / `npm test`.

### Option 2: Managed PostgreSQL (recommended for real use)

Any managed Postgres provider works — [Neon](https://neon.tech),
[Supabase](https://supabase.com) and [Railway](https://railway.app) all have a
free tier and need no local install (no Docker, no `psql`).

1. **Create a project** on your provider of choice and grab the connection
   string it gives you — it looks like:

   ```
   postgresql://user:password@host/dbname?sslmode=require
   ```

2. **Set it in `.env`:**

   ```bash
   DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
   ```

3. **Restart the server:**

   ```bash
   npm run dev:api
   ```

   On boot you should see:

   ```
   [Postgres] متصل — الحسابات والطلبات تُحفظ في قاعدة البيانات
   ```

   Tables (`users`, `sessions`, `addresses`, `wishlist_items`, `orders`) are
   created automatically the first time the server starts — no manual
   migration step.

4. **(Optional) Carry over existing local data.** If `src/data/users.jsonl` /
   `orders.local.jsonl` already have real accounts or orders in them, run:

   ```bash
   npm run migrate:pg
   ```

   This is a one-off script — safe to skip on a fresh install.

## Notes

- `DATABASE_URL` is read once at boot. Changing it requires a restart.
- The API and response shapes are identical either way — the frontend needs
  no changes.
- The product catalogue is **not** stored in Postgres; Odoo (or the demo
  catalogue) stays the live source, same as before.
