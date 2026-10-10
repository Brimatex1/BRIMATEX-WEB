# Brimatex website and server - instructions for Claude

The store at https://brimatex.ly and the server behind it and the mobile app
(repo BRIMATEX-APP). Node `http` server in `src/`, React/Vite SPA in `web/`,
Odoo for products, prices, stock and orders. See README.md for the layout,
commands, API and deployment, and `docs/` for the rest.

## Working with the owner

- Reply to the owner in **Libyan Arabic**. Code, comments, commit messages and
  docs in **English**. Text customers see in **Modern Standard Arabic**
  («مرتبة», never «فرشة»).
- **Push only when the owner says «ارفع».** Commit freely; never push
  unasked. Work on a branch from `origin/main`, push with
  `git push origin HEAD:main`.
- End every commit message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Never type, paste, upload or print credentials, tokens, passwords or API
  keys, and never open, print or upload `.env` - the owner sets secrets on the
  server. The cPanel deploy is the owner's to press.
- **Odoo:** never delete Odoo records; write to Odoo only when the owner asks.
- Never place real orders or create real accounts on the live site.

## Checks before any commit

- `npm test` (Node 22) - every `tests/*.check.js` and the smoke test, each on
  its own server in local mode (no database, Odoo or WhatsApp). One file:
  `node tests/run.js <word>`.
- `npm run typecheck` for the frontend.
- Do not commit a local `npm run build`: `src/public/` is built and committed
  by the "build" workflow on `main` (the host cannot build it).

## Deployment

Push to `main` -> GitHub builds `web/` into `src/public/` and commits it ->
the owner runs cPanel «Update from Remote» + «Deploy HEAD Commit»
(`.cpanel.yml` -> `scripts/deploy.sh`). `/api/health` shows the live
`version`. Postgres on the host is 9.2: no `on conflict`, no json operators,
new columns through `do $$ ... information_schema` blocks (see `src/lib/db.js`).

## Privacy decisions (Apple and Google Play, Oct 2026) - keep them

- Accounts: first name + family name + phone + password; WhatsApp code only to
  open an account, reset a password, or as a fallback to confirm deletion.
- Deleting an account (`DELETE /api/auth/me`) needs the password or a
  WhatsApp-code `resetToken`; the website's order copies then lose name,
  phone and address (city kept). Odoo keeps everything. Web deletion page:
  `/delete-account`.
- Ad consent is one field, `users.tracking_status`, for both apps; only
  `authorized` may ever let an account's data reach Meta. Today the server
  sends no app orders to Meta (the website's orders go through Pixel + CAPI).
- No analytics tools. The privacy policy is `web/src/shop/legal.ts` and the
  app's `src/screens/LegalScreen.tsx` - change both together; contact
  `privacy@brimatex.ly`.
- Apple/Google reviewer account: `BRIMATEX_REVIEW_PHONE` /
  `BRIMATEX_REVIEW_PASSWORD` in `.env` (src/lib/reviewAccount.js); its orders
  never reach Odoo, delivery, Meta or WhatsApp.
