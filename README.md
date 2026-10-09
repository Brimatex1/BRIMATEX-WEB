# Brimatex - web store

The online store of Brimatex, a Libyan mattress maker: [brimatex.ly](https://brimatex.ly).
Arabic, right to left, prices in Libyan dinars (د.ل), cash on delivery.

This repository holds the website and the server behind both the website and
the mobile app ([BRIMATEX-APP](https://github.com/Brimatex1/BRIMATEX-APP)).

- **Server** - Node.js, plain `http`, two dependencies (`pg`,
  `capi-param-builder-nodejs`). Accounts, orders, the admin API and the app API.
- **Frontend** - React 18, TypeScript, Vite, Tailwind CSS / shadcn/ui: the
  storefront, the admin panel and the classic dashboard. See
  [docs/FRONTEND.md](docs/FRONTEND.md).
- **Odoo** - the source of products, prices, stock and sales orders.
- **Storage** - PostgreSQL 9.2+ when `DATABASE_URL` is set, otherwise JSONL
  files in `src/data/` ([docs/POSTGRES_SETUP.md](docs/POSTGRES_SETUP.md)).
- **WhatsApp** - one-time codes through the Cloud API, an optional invoice
  through Twilio ([docs/WHATSAPP_SETUP.md](docs/WHATSAPP_SETUP.md)).
- **Meta** - Pixel and Conversions API with shared event ids, and the product
  catalogue feed (`/feeds/meta-catalog.csv`).
- **Push** - order updates and offers to the app through Expo.

## Getting started

Requires Node.js 18 or newer (22 to run the full test suite).

```bash
npm install            # server dependencies, then web/ (postinstall)
cp .env.example .env   # optional - every value may stay empty
npm run dev:api        # server: http://localhost:3000
npm run dev:web        # storefront with hot reload: http://localhost:5173
```

With an empty `.env` the server runs in local mode: the demo catalogue
instead of Odoo, the file store instead of PostgreSQL, and WhatsApp codes
printed to the log. Every variable is described in [.env.example](.env.example).

To be an admin locally, put your phone number in `ADMIN_PHONES`, open an
account, and go to `/admin`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev:api` | Starts the server (`server.js` -> `src/server.js`) |
| `npm run dev:web` | Starts Vite; `/api` is forwarded to the server |
| `npm run build` | Type-checks and builds the frontend into `src/public/` |
| `npm run typecheck` | TypeScript checks only |
| `npm test` | The whole test suite (`tests/run.js`) |
| `node tests/run.js panel auth` | Only the test files whose name contains a word |
| `npm run migrate:pg` | Copies the file store into PostgreSQL |
| `npm run diag:pg` | Read-only PostgreSQL connection check (`-- --apply` to fix) |

## Layout

```
server.js               entry point (the host starts this file)
src/
├── server.js           HTTP server: static files, public API, routing
├── routes/             auth, user, orders, admin, panel, Meta events
├── lib/                Odoo, catalogue, orders, push, Meta, WhatsApp, …
│   └── store/          file-store and PostgreSQL implementations
├── data/               source data (demo catalogue, product details) and,
│                       untracked, the file store's runtime data
└── public/             the built frontend - generated, see Deployment
web/                    the frontend source (docs/FRONTEND.md)
tests/                  *.check.js files and smoke.test.js, run by tests/run.js
scripts/                deploy, auto-deploy, order-status sync, PostgreSQL tools
docs/                   setup guides
assets/brand/           the logo source
```

## API

The routes live in `src/server.js` (public catalogue, banners, health, app
config, devices, support) and `src/routes/`:

| File | Prefix | |
|---|---|---|
| `auth.js` | `/api/auth/*` | Sign-in with phone and password; WhatsApp code to open an account or reset a password (`/api/auth/phone/*` stays for older app builds) |
| `user.js` | `/api/user/*` | Addresses, wishlist, avatar, orders, reviews, loyalty, perks, coupons |
| `orders.js` | `/api/orders`, `/api/invoices` | Placing an order (needs a session) - an Odoo sales order |
| `admin.js` | `/api/admin/*` | Classic dashboard: settings, reviews, products, banners, customers |
| `panel.js` | `/api/panel/*` | Admin panel: orders, customers, products, push, quiz |
| `metaEvents.js` | `/api/meta/*` | Browser events relayed to the Conversions API |

`GET /api/health` answers `{ ok, odooConfigured, store, version, deployedAt }`.

## Tests

`npm test` runs every `tests/*.check.js` and then `tests/smoke.test.js`, one at
a time - each starts its own server on its own port, in local mode, so no
Odoo, database or WhatsApp is touched. GitHub Actions runs the suite on every
push and pull request to `main` (`.github/workflows/node.js.yml`).

## Deployment

The host (cPanel, Phusion Passenger) cannot build the frontend - Rollup needs a
newer GLIBC than it has - so the build happens on GitHub:

1. A push to `main` runs the "build" workflow
   (`.github/workflows/deploy.yml`): it builds `web/` and commits the output
   to `src/public/` with `[skip ci]`.
2. On cPanel: **Git Version Control -> Manage -> Update from Remote**, then
   **Deploy HEAD Commit**. That runs `.cpanel.yml` -> `scripts/deploy.sh`,
   which copies the code into the app folder (never `.env`, `src/data/*` or
   uploads), installs dependencies if the lockfile changed, checks
   `src/public/index.html` and restarts the app.
3. `/api/health` shows the deployed `version`.

`scripts/auto-deploy.sh` can do step 2 from cron instead, and
`scripts/cron-order-sync.sh` keeps order statuses in step with Odoo - both in
[docs/AUTOMATION.md](docs/AUTOMATION.md).

## Docs

- [docs/FRONTEND.md](docs/FRONTEND.md) - the React apps, running and building them
- [docs/POSTGRES_SETUP.md](docs/POSTGRES_SETUP.md) - the database
- [docs/WHATSAPP_SETUP.md](docs/WHATSAPP_SETUP.md) - WhatsApp codes and invoices
- [docs/AUTOMATION.md](docs/AUTOMATION.md) - cron jobs on the host
- [docs/BRAND_COLORS.md](docs/BRAND_COLORS.md) - palette, contrast, logo
