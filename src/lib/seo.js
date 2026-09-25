/**
 * robots.txt and sitemap.xml - what search engines read to find the shop.
 *
 * Both addresses used to fall through to the app shell, so a crawler asking
 * for the sitemap got the home page's HTML and no list of products. The
 * sitemap is built from the public catalogue on each request: home, the shop,
 * a page per Odoo tier, the quiz, and every product - a product added in
 * Odoo is listed with no further step.
 */
'use strict';

const { escapeHtml, imageOf } = require('./share');

/**
 * Pages with nothing for a search engine: private, per customer, or the
 * dashboard. Not /api/: a search engine renders the shop with JavaScript and
 * needs /api/products to see any mattress, and product photos are served
 * from /api/products/:id/image.
 */
const PRIVATE = ['/admin', '/account', '/orders', '/cart', '/wishlist', '/vouchers', '/points'];

function robots(origin) {
  return ['User-agent: *', ...PRIVATE.map((p) => `Disallow: ${p}`), '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

function sitemap(products, origin) {
  const tiers = [...new Map(products.filter((p) => p.tier).map((p) => [p.tier.key, p.tier])).values()].sort(
    (a, b) => a.rank - b.rank
  );
  const urls = [
    { loc: '/', priority: '1.0' },
    { loc: '/shop', priority: '0.9' },
    ...tiers.map((t) => ({ loc: `/shop?category=${encodeURIComponent(t.key)}`, priority: '0.8' })),
    ...products.map((p) => ({ loc: `/product/${p.id}`, priority: '0.8', image: imageOf(p, origin) })),
    { loc: '/quiz', priority: '0.5' },
  ];
  const body = urls
    // A product's photo rides with its page - how Google Images finds it.
    .map(
      (u) =>
        `  <url><loc>${escapeHtml(origin + u.loc)}</loc>${
          u.image ? `<image:image><image:loc>${escapeHtml(u.image)}</image:loc></image:image>` : ''
        }<priority>${u.priority}</priority></url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`;
}

module.exports = { robots, sitemap, PRIVATE };

/*
 * One address per page (Google's "duplicate content" and "soft 404" rules).
 */

/** Addresses the app answers; anything else is a 404, not the home page with a 200. */
const APP_PATHS = new Set(['/', '/shop', '/quiz', '/cart', '/account', '/wishlist', '/orders', '/admin', '/vouchers', '/points']);

const isLocalHost = (host) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host || '');

/**
 * Where a GET should be sent instead (301), or null:
 *   www.brimatex.ly/...        -> brimatex.ly/...   (one host, not two copies)
 *   http://... (per the proxy) -> https://...
 *   /shop/                     -> /shop             (one spelling per page)
 *   /favicon.ico               -> /favicon.svg      (browsers ask for it by name)
 */
function redirectFor(req, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const host = String(req.headers.host || '');
  const bareHost = host.replace(/^www\./i, '');
  const forwardedHttp = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'http';
  let path = url.pathname;
  if (path === '/favicon.ico') path = '/favicon.svg';
  else if (path.length > 1 && path.endsWith('/')) {
    // Only the app's own pages: a folder serving its own site needs its slash
    // for its relative links.
    const bare = path.replace(/\/+$/, '') || '/';
    if (APP_PATHS.has(bare) || /^\/product\/\d+$/.test(bare)) path = bare;
  }
  const changedHost = bareHost !== host;
  const toHttps = forwardedHttp && !isLocalHost(host);
  if (!changedHost && !toHttps && path === url.pathname) return null;
  const scheme = isLocalHost(bareHost) ? 'http' : 'https';
  return `${scheme}://${bareHost}${path}${url.search}`;
}

/**
 * The status of an app page: 404 for an address the app does not have, or a
 * product that is not (or no longer) sold - a "soft 404" otherwise. An empty
 * catalogue means Odoo could not be read, not that the product is gone, so
 * then a product page stays 200.
 */
function statusFor(pathname, products) {
  const product = pathname.match(/^\/product\/(\d+)$/);
  if (product) {
    if (products.length === 0) return 200;
    const id = Number(product[1]);
    return products.some((p) => p.id === id || (p.variants ?? []).some((v) => v.id === id)) ? 200 : 404;
  }
  return APP_PATHS.has(pathname) ? 200 : 404;
}

module.exports.redirectFor = redirectFor;
module.exports.statusFor = statusFor;
module.exports.APP_PATHS = APP_PATHS;
