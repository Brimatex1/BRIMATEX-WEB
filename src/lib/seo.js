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

const { escapeHtml } = require('./share');

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
    ...products.map((p) => ({ loc: `/product/${p.id}`, priority: '0.8' })),
    { loc: '/quiz', priority: '0.5' },
  ];
  const body = urls
    .map((u) => `  <url><loc>${escapeHtml(origin + u.loc)}</loc><priority>${u.priority}</priority></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

module.exports = { robots, sitemap, PRIVATE };
