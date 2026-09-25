#!/usr/bin/env node
// Share previews and Meta's catalogue - src/lib/share.js, src/lib/metaFeed.js.
//
// - every page carries Open Graph tags; a product page names the product, its
//   price and its picture, in the HTML itself (crawlers run no JavaScript)
// - text from the catalogue is escaped, never markup
// - files are still served as files
// - robots.txt and sitemap.xml are real files, listing every product
// - the feed lists one row per size, in dollars at the Pixel's rate, with the
//   ids the Pixel reports, and leaves out products with no picture
//
// Runs with the rest: npm test

'use strict';

const http = require('http');
const { startTestServer } = require('./_server');

const fs = require('fs');
const path = require('path');

const PORT = process.env.TEST_PORT || 3184;
const ADMIN_PHONE = '09' + Math.floor(10000000 + Math.random() * 89999999);
const uniq = () => '09' + Math.floor(10000000 + Math.random() * 89999999);

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } else {
    fail++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log('  \x1b[31m✗\x1b[0m ' + name + (detail ? ' — ' + detail : ''));
  }
}

function req(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: p,
        method,
        headers: {
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(raw.toString('utf8'));
          } catch {
            /* not JSON */
          }
          resolve({ status: res.statusCode, json, type: res.headers['content-type'], raw, text: raw.toString('utf8') });
        });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const share = require('../src/lib/share');
const metaFeed = require('../src/lib/metaFeed');

// A real 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const meta = (html, prop) => {
  const m = new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`).exec(html);
  return m ? m[1] : null;
};

function unitPart() {
  const origin = 'https://brimatex.ly';
  const evil = { id: 9, name: '"><script>alert(1)</script>', price: 500, inStock: true, hasImage: true };
  const html = share.render('<html><head><title>x</title></head></html>', '/product/9', '', { products: [evil], banners: [], origin });
  ok('اسم خبيث يُهرَّب', !html.includes('<script>alert') && html.includes('&lt;script&gt;'));

  const product = {
    id: 202,
    name: 'Daily Mattress',
    price: 150,
    hasImage: true,
    tier: { key: 'comfort', name: 'كومفورت', rank: 2 },
    variants: [
      { id: 202, label: 'H18, 90*190', price: 640, inStock: true },
      { id: 203, label: 'H24, 90*190', price: 720, inStock: false },
    ],
  };
  // schema.org for search engines, with a review trying to close the data block.
  const reviews = {
    count: 2,
    average: 4.5,
    reviews: [{ id: 'r1', rating: 5, comment: 'ممتازة</script><script>alert(1)</script>', name: 'سالم', createdAt: '2026-09-20T10:00:00.000Z' }],
  };
  const page = share.render('<html><head><title>x</title></head></html>', '/product/203', '', { products: [product], banners: [], origin, reviews });
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const ld = blocks.find((b) => b['@type'] === 'Product');
  ok('schema: منتج بعروض بالدينار', ld?.offers?.['@type'] === 'AggregateOffer' && ld.offers.priceCurrency === 'LYD' && ld.offers.lowPrice === 640 && ld.offers.highPrice === 720, JSON.stringify(ld?.offers));
  ok('schema: التقييم', ld?.aggregateRating?.ratingValue === 4.5 && ld.aggregateRating.reviewCount === 2 && ld.review?.[0]?.author?.name === 'سالم');
  ok('schema: </script> في تقييم لا يكسر الصفحة', !page.includes('<script>alert') && ld.review[0].reviewBody.includes('</script>'));
  const tierPage = share.render('<html><head><title>x</title></head></html>', '/shop', '?category=comfort&q=x', { products: [product], banners: [], origin });
  ok('صفحة فئة: عنوانها ورابطها الأساسي', tierPage.includes('<title>مراتب كومفورت — بريماتكس</title>') && tierPage.includes('<link rel="canonical" href="https://brimatex.ly/shop?category=comfort" />'));
  const unknownTier = share.render('<html><head><title>x</title></head></html>', '/shop', '?category=nope', { products: [product], banners: [], origin });
  ok('فئة غير موجودة: رابط المتجر', unknownTier.includes('<link rel="canonical" href="https://brimatex.ly/shop" />'));
  ok('schema: الرئيسية تسمّي المتجر فقط', share.structuredData({ type: 'website' }, { origin }, origin).every((b) => b['@type'] === 'Organization'));

  const noPicture = { id: 300, name: 'No Picture', price: 700, inStock: true };
  const { csv, count, skipped } = metaFeed.buildCsv([product, noPicture], { origin, lydPerUsd: 8 });
  const lines = csv.trim().split('\n');
  ok('سطر لكل مقاس', count === 2 && lines.length === 3, csv);
  ok('المنتج بلا صورة مستبعد', skipped === 1 && !csv.includes('No Picture'));
  ok('المعرّف والمجموعة كما يرسلها البكسل', lines[1].startsWith('"202","202"') && lines[2].startsWith('"203","202"'), lines[1]);
  ok('السعر بالدولار بسعر 8', lines[1].includes('"80.00 USD"') && lines[2].includes('"90.00 USD"'));
  ok('المخزون', lines[1].includes('"in stock"') && lines[2].includes('"out of stock"'));
  ok('الصورة والرابط', lines[1].includes('"https://brimatex.ly/api/products/202/image"') && lines[1].includes('"https://brimatex.ly/product/202"'));
  ok('بلا سعر صرف: بالدينار', metaFeed.buildCsv([product], { origin, lydPerUsd: 0 }).csv.includes('"640.00 LYD"'));
}

(async () => {
  unitPart();

  const settingsFile = path.join(__dirname, '..', 'src', 'data', 'settings.local.json');
  const before = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile) : null;
  const { server } = await startTestServer({ port: PORT, env: { ADMIN_PHONES: ADMIN_PHONE } });
  let uploaded = null;
  try {
    const home = await req('GET', '/');
    ok('الرئيسية: og:title', meta(home.text, 'og:title') === 'بريماتكس — متجر المراتب الفاخرة', meta(home.text, 'og:title'));
    ok('الرئيسية: الوصف بلا تجربة', !home.text.includes('ليلة') && Boolean(meta(home.text, 'og:description')));
    ok('الرئيسية: HTML ولا تُخزَّن', /text\/html/.test(home.type) && home.status === 200);
    ok('الرئيسية: السكربت ما زال في الصفحة', /<script type="module"[^>]*src="\/assets\/index-/.test(home.text));

    const products = (await req('GET', '/api/products')).json.products;
    const p = products[0];
    const page = await req('GET', `/product/${p.id}`);
    ok('صفحة المنتج: اسمه في العنوان', page.text.includes(`<title>${p.name} — بريماتكس</title>`));
    ok('صفحة المنتج: og:type product', meta(page.text, 'og:type') === 'product');
    ok('صفحة المنتج: السعر بالدينار', meta(page.text, 'product:price:amount') === String(p.price) && meta(page.text, 'product:price:currency') === 'LYD');
    ok('صفحة المنتج: الرابط الأساسي', page.text.includes(`<link rel="canonical" href="http://127.0.0.1:${PORT}/product/${p.id}" />`));
    ok('منتج غير موجود: الوسوم العامة', meta((await req('GET', '/product/999999')).text, 'og:type') === 'website');
    ok('الملفات تُخدم كما هي', /image\/svg/.test((await req('GET', '/favicon.svg')).type));

    const robots = await req('GET', '/robots.txt');
    ok('robots.txt نص وليس الصفحة', robots.status === 200 && /text\/plain/.test(robots.type) && !robots.text.includes('<html'));
    ok('robots.txt يمنع اللوحة ويشير للخريطة', robots.text.includes('Disallow: /admin') && !robots.text.includes('/api') && robots.text.includes(`Sitemap: http://127.0.0.1:${PORT}/sitemap.xml`));
    const map = await req('GET', '/sitemap.xml');
    ok('sitemap.xml بصيغة XML', map.status === 200 && /xml/.test(map.type) && map.text.startsWith('<?xml'));
    ok('الخريطة فيها كل منتج', products.every((x) => map.text.includes(`/product/${x.id}</loc>`)));
    ok('والرئيسية والمتجر، بلا اللوحة', map.text.includes(`<loc>http://127.0.0.1:${PORT}/</loc>`) && map.text.includes('/shop</loc>') && !map.text.includes('/admin'));

    const register = async (phone) =>
      (await req('POST', '/api/auth/register', { name: 'تجربة', phone, password: 'secret1' })).json.token;
    const admin = await register(ADMIN_PHONE);
    await req('PUT', '/api/admin/settings/facebook-pixel', { pixelId: '1234567890', lydPerUsd: '8' }, admin);

    const empty = await req('GET', '/feeds/meta-catalog.csv');
    ok('الكتالوج: CSV', empty.status === 200 && /text\/csv/.test(empty.type) && empty.text.startsWith('id,item_group_id,title'));
    ok('الكتالوج: بلا صور لا أسطر', empty.text.trim().split('\n').length === 1);

    const up = await req('POST', `/api/admin/products/${p.id}/image`, { imageDataUrl: `data:image/png;base64,${PNG.toString('base64')}` }, admin);
    uploaded = up.json?.imageUrl;
    ok('رفع صورة المنتج من اللوحة', up.status === 200 && Boolean(uploaded), up.status + ' ' + JSON.stringify(up.json));
    const feed = await req('GET', '/feeds/meta-catalog.csv');
    const row = feed.text.trim().split('\n')[1] || '';
    ok('الكتالوج: المنتج بصورته', row.startsWith(`"${p.id}","${p.id}"`) && row.includes(uploaded), row);
    ok('الكتالوج: بالدولار', row.includes(`"${(p.price / 8).toFixed(2)} USD"`), row);
    ok('صفحة المنتج: og:image', meta((await req('GET', `/product/${p.id}`)).text, 'og:image') === `http://127.0.0.1:${PORT}${uploaded}`);
    await req('DELETE', `/api/admin/products/${p.id}/image`, null, admin);
  } finally {
    server.kill();
    if (before) fs.writeFileSync(settingsFile, before);
    else fs.rmSync(settingsFile, { force: true });
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` + (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : ''));
  for (const f of failures) console.log('  • ' + f);
  console.log('────────────────────────────────────────────────────');
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
