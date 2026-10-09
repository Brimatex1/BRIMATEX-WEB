# Frontend

React 18 + TypeScript + Vite + Tailwind CSS (shadcn/ui primitives), right to
left, in `web/`. One build serves three apps, chosen by the address in
`web/src/main.tsx`:

| Address | App | Source |
|---|---|---|
| `/admin/classic…` | The classic dashboard - reviews, Odoo connection, Meta pixel, WhatsApp | `web/src/AdminApp.tsx`, `web/src/components/` |
| `/admin…` | The admin panel - orders, customers, products, banners, push, quiz, settings | `web/src/panel/` |
| anything else | The storefront | `web/src/shop/` |

The two admin apps are lazy chunks: customers never download them.

## Layout

```
web/
├── index.html            the single page; loads src/main.tsx
├── vite.config.ts        build into ../src/public, dev proxy to the server
├── tailwind.config.js
└── src/
    ├── main.tsx          picks the app by address
    ├── index.css         fonts (IBM Plex Sans Arabic) and the colour tokens
    ├── shop/             storefront: ShopApp.tsx, router.tsx, pages/, account/
    ├── panel/            admin panel: PanelApp.tsx, router.tsx, pages/
    ├── AdminApp.tsx      classic dashboard
    ├── components/       classic dashboard panels, and ui/ (shadcn/ui)
    ├── hooks/            data hooks shared by the apps
    └── lib/              api client, Meta Pixel, delivery dates, search, …
```

## Running

```bash
npm install          # also installs web/ (postinstall)
npm run dev:api      # the server on http://localhost:3000
npm run dev:web      # Vite on http://localhost:5173
```

Open http://localhost:5173. Vite forwards `/api`, `/uploads` and `/images` to
the server (or to `API_TARGET` if set).

`npm run build` type-checks and builds into `src/public/`, which the server
serves. On `main` the "build" workflow does this and commits the result -
see the README's Deployment section. Do not commit a local build.

`npm run typecheck` runs the TypeScript checks alone.

## Design system

Colours are CSS variables in `web/src/index.css`, mapped in
`tailwind.config.js`; the brand palette and contrast are in
[BRAND_COLORS.md](BRAND_COLORS.md). Change the variables, not components.

Add a shadcn/ui component with `npx shadcn@latest add <name>` inside `web/`
(settings in `web/components.json`), or copy it into `web/src/components/ui/`.

## Things to know

- **Content Security Policy.** The server sends `script-src 'self'`
  (`SHELL_CSP` in `src/server.js`), so no inline script runs - which is why
  `vite.config.ts` sets `modulePreload.polyfill: false`. A new outside origin
  (fonts, images, an API) must be added to `SHELL_CSP`.
- **Caching.** Files under `/assets/` carry a content hash and are cached for a
  year; `index.html` is sent `no-cache` (checked on every visit), so a deploy
  needs no cache clearing.
- **Order rate limit.** 10 orders per address per minute
  (`RATE_LIMIT_ORDERS_PER_MIN`).
