#!/usr/bin/env node
// Share previews and Meta's catalogue - src/lib/share.js, src/lib/metaFeed.js.
//
// - every page carries Open Graph tags; a product page names the product, its
//   price and its picture, in the HTML itself (crawlers run no JavaScript)
// - text from the catalogue is escaped, never markup
// - files are still served as files
// - robots.txt and sitemap.xml are real files, listing every product
// - the feed lists one row per size, in dinars as the site sells them, with the
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
  const evil = { id: 9, name: '"><script>alert(1)</script>', price: 500, inStock: true, image: '/uploads/products/9-1.png' };
  const html = share.render('<html><head><title>x</title></head></html>', '/product/9', '', { products: [evil], banners: [], origin });
  ok('اسم خبيث يُهرَّب', !html.includes('<script>alert') && html.includes('&lt;script&gt;'));
  const shellHtml = '<html><head><title>x</title></head><body><div id="root"></div></body></html>';
  const evilBody = share.render(shellHtml, '/product/9', '', { products: [evil], banners: [], origin });
  ok('المحتوى المكتوب للمتصفح يُهرَّب أيضاً', !evilBody.includes('<script>alert') && evilBody.includes('<div id="root"><div class="ssr-fallback">'));

  const product = {
    id: 202,
    name: 'Daily Mattress',
    price: 150,
    image: '/uploads/products/202-1.png',
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
  const withCrumbs = share.render(shellHtml, '/product/203', '', { products: [product], banners: [], origin });
  const crumbs = [...withCrumbs.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .find((b) => b['@type'] === 'BreadcrumbList');
  ok('schema: مسار الصفحة', crumbs?.itemListElement?.map((c) => c.name).join(' › ') === 'بريماتكس › مراتب كومفورت › Daily Mattress', JSON.stringify(crumbs));
  ok('رابط مقاس: الرابط الأساسي للمرتبة', withCrumbs.includes('<link rel="canonical" href="https://brimatex.ly/product/202" />'));
  ok('العنوان بالعربي مع نوع المرتبة', withCrumbs.includes('<title>Daily Mattress — مرتبة كومفورت | بريماتكس</title>'));
  ok('محتوى الصفحة: العنوان والمقاسات بأسعارها', withCrumbs.includes('<h1>Daily Mattress</h1>') && withCrumbs.includes('H18, 90*190: 640 د.ل') && withCrumbs.includes('(غير متوفر حالياً)'));
  ok('schema: الرئيسية تسمّي المتجر فقط', share.structuredData({ type: 'website' }, { origin }, origin).every((b) => ['Organization', 'WebSite'].includes(b['@type'])));

  const noPicture = { id: 300, name: 'No Picture', price: 700, inStock: true };
  const { csv, count, skipped } = metaFeed.buildCsv([product, noPicture], { origin, lydPerUsd: 8 });
  const lines = csv.trim().split('\n');
  ok('سطر لكل مقاس', count === 2 && lines.length === 3, csv);
  ok('المنتج بلا صورة مستبعد', skipped === 1 && !csv.includes('No Picture'));
  ok('المعرّف والمجموعة كما يرسلها البكسل', lines[1].startsWith('"202","202"') && lines[2].startsWith('"203","202"'), lines[1]);
  ok('السعر بالدينار كما يبيعه الموقع، حتى مع سعر صرف البكسل', lines[1].includes('"640.00 LYD"') && lines[2].includes('"720.00 LYD"') && !csv.includes('USD'), lines[1]);
  ok('المخزون', lines[1].includes('"in stock"') && lines[2].includes('"out of stock"'));
  ok('الصورة والرابط', lines[1].includes('"https://brimatex.ly/uploads/products/202-1.png"') && lines[1].includes('"https://brimatex.ly/product/202"'));
  ok('بلا سعر صرف: بالدينار كذلك', metaFeed.buildCsv([product], { origin, lydPerUsd: 0 }).csv.includes('"640.00 LYD"'));

  // The whole story per mattress reaches Meta, not just a line
  const full = { ...product, id: 400, description: 'وصف <المرتبة> & تفاصيلها.', iconFeatures: ['warranty-6', 'pressure-30', 'anti-allergy'], warrantyYears: 6, layers: ['طبقة ميموري فوم', 'إسفنج ضغط 30'], variants: undefined };
  const [row] = metaFeed.rowsFor(full, { origin });
  ok('الوصف: المميزات والضمان والمكوّنات', row.description.includes('المميزات: ضغط إسفنج 30، مضاد للحساسية.') && row.description.includes('ضمان المصنع 6 سنوات') && row.description.includes('مكوّنات المرتبة: طبقة ميموري فوم، إسفنج ضغط 30.'), row.description);
  ok('أيقونة الضمان لا تتكرر بين المميزات', !row.description.includes('المميزات: ضمان'));
  ok('الوصف المنسّق: قوائم، والنص مهرّب', row.rich_text_description.includes('<ul><li>ضغط إسفنج 30</li>') && row.rich_text_description.includes('<ol><li>طبقة ميموري فوم</li>') && row.rich_text_description.includes('وصف &lt;المرتبة&gt; &amp; تفاصيلها.'), row.rich_text_description);
  ok('الفئة وتصنيف المراتب والضمان كوسوم', row.custom_label_1 === 'ضمان 6 سنوات' && row.google_product_category.endsWith('Mattresses'));
  const bare = metaFeed.rowsFor({ id: 401, name: 'X', price: 10, image: '/x.png' }, { origin })[0];
  ok('منتج بلا تفاصيل: وصف افتراضي، بلا أقسام فارغة', bare.description.startsWith('مرتبة بريماتكس') && !bare.rich_text_description.includes('<h3>'), bare.rich_text_description);

  // Plain text for Meta, whatever the dashboard holds
  const messy = { id: 402, name: 'مرتبة 😴 <b>تجربة</b>', price: 10, image: '/x.png', description: '<p>مرتبة&nbsp;مريحة ✨ جداً</p>\u200f\u200d\uFE0F\uFFFD ثباتاً متوازناً ودعماً مريحاً' };
  const [clean] = metaFeed.rowsFor(messy, { origin });
  ok('الوصف: بلا وسوم ولا إيموجي ولا علامات خفية', clean.description.startsWith('مرتبة مريحة جداً ثباتاً متوازناً ودعماً مريحاً') && !/[<>😴✨\u200f\u200d\uFE0F\uFFFD]/u.test(clean.description), clean.description);
  ok('العنوان: نص عادي', clean.title === 'مرتبة تجربة', clean.title);
  ok('الحركات العربية تبقى', metaFeed.plainText('ثباتاً مُريحاً') === 'ثباتاً مُريحاً');
  const long = metaFeed.rowsFor({ ...messy, description: 'كلمة '.repeat(3000) }, { origin })[0].description;
  ok('وصف أطول من حد ميتا يُقصّ عند كلمة، ولا يزيد عن 9999', long.length <= 9999 && long.endsWith('كلمة'), String(long.length));
  const real = metaFeed.rowsFor(full, { origin })[0].description;
  ok('وصف عادي لا يُقصّ أبداً', real.endsWith('الدفع عند الاستلام وتوصيل مجاني لباب البيت.') && !real.includes('...'));

  // The labels the feed writes are the product page's own (web/src/lib/icons.ts)
  const { FEATURE_LABELS } = require('../src/lib/featureLabels');
  const iconsTs = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'lib', 'icons.ts'), 'utf8');
  const webLabels = Object.fromEntries([...iconsTs.matchAll(/^\s*'([a-z0-9-]+)': \{ key: '[a-z0-9-]+', file: '[^']+', label: '([^']+)' \}/gm)].map((m) => [m[1], m[2]]));
  ok('تسميات المميزات = تسميات صفحة المنتج', Object.keys(webLabels).length > 20 && JSON.stringify(webLabels) === JSON.stringify(FEATURE_LABELS), Object.keys(webLabels).filter((k) => webLabels[k] !== FEATURE_LABELS[k]).join(', '));
}

(async () => {
  unitPart();

  const settingsFile = path.join(__dirname, '..', 'src', 'data', 'settings.local.json');
  const before = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile) : null;
  const { server } = await startTestServer({ port: PORT, env: { ADMIN_PHONES: ADMIN_PHONE } });
  let uploaded = null;
  try {
    const home = await req('GET', '/');
    ok('الرئيسية: og:title', meta(home.text, 'og:title') === 'بريماتكس — مراتب صناعة ليبية | الدفع عند الاستلام', meta(home.text, 'og:title'));
    ok('الرئيسية: الوصف بلا تجربة', !home.text.includes('ليلة') && Boolean(meta(home.text, 'og:description')));
    ok('الرئيسية: HTML ولا تُخزَّن', /text\/html/.test(home.type) && home.status === 200);
    ok('الرئيسية: السكربت ما زال في الصفحة', /<script type="module"[^>]*src="\/assets\/index-/.test(home.text));

    const products = (await req('GET', '/api/products')).json.products;
    const p = products[0];
    const page = await req('GET', `/product/${p.id}`);
    ok('صفحة المنتج: اسمه في العنوان', page.text.includes(`<title>${p.name} — مرتبة ${p.tier.name} | بريماتكس</title>`));
    ok('الرئيسية: روابط كل المراتب في الصفحة نفسها', products.every((x) => home.text.includes(`<a href="/product/${x.id}">`)));
    ok('صفحة المنتج: h1 باسمه', page.text.includes('<h1>' + p.name.replace(/&/g, '&amp;') + '</h1>'));
    ok('صفحة المنتج: og:type product', meta(page.text, 'og:type') === 'product');
    ok('صفحة المنتج: السعر بالدينار', meta(page.text, 'product:price:amount') === String(p.price) && meta(page.text, 'product:price:currency') === 'LYD');
    ok('صفحة المنتج: الرابط الأساسي', page.text.includes(`<link rel="canonical" href="http://127.0.0.1:${PORT}/product/${p.id}" />`));
    ok('منتج غير موجود: الوسوم العامة', meta((await req('GET', '/product/999999')).text, 'og:type') === 'website');
    ok('الملفات تُخدم كما هي', /image\/svg/.test((await req('GET', '/favicon.svg')).type));

    // One address per page, and real 404s (Google: duplicate content, soft 404).
    const raw = (p, headers = {}) =>
      new Promise((resolve) =>
        http.get({ hostname: '127.0.0.1', port: PORT, path: p, headers }, (res) => {
          let text = '';
          res.on('data', (c) => (text += c));
          res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, text }));
        })
      );
    const unknown = await raw('/no-such-page');
    ok('صفحة غير موجودة: 404 وnoindex', unknown.status === 404 && unknown.text.includes('<meta name="robots" content="noindex" />'));
    ok('مرتبة غير موجودة: 404', (await raw('/product/987654')).status === 404);
    ok('ملف غير موجود: 404 لا الصفحة الرئيسية', (await raw('/logo.png')).status === 404);
    ok('الصفحات الموجودة: 200 بلا noindex', (await raw('/quiz')).status === 200 && !(await raw('/')).text.includes('noindex'));
    const slash = await raw('/shop/?category=comfort');
    ok('/shop/ → /shop (301)', slash.status === 301 && slash.location === `http://127.0.0.1:${PORT}/shop?category=comfort`, JSON.stringify(slash.location));
    const www = await raw('/product/1', { Host: 'www.example.com' });
    ok('www → بلا www (301)', www.status === 301 && www.location === 'https://example.com/product/1', www.location);
    const insecure = await raw('/', { Host: 'example.com', 'X-Forwarded-Proto': 'http' });
    ok('http → https (301)', insecure.status === 301 && insecure.location === 'https://example.com/', insecure.location);
    ok('favicon.ico → favicon.svg', (await raw('/favicon.ico')).location?.endsWith('/favicon.svg'));
    ok('رابط بتتبّع فيسبوك: og:url بدونه', meta((await req('GET', '/?fbclid=abc&utm_source=fb')).text, 'og:url') === `http://127.0.0.1:${PORT}/`);

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

    ok('بلا صورة مرفوعة: صورة المنتج 404', (await req('GET', `/api/products/${p.id}/image`)).status === 404);
    const up = await req('POST', `/api/admin/products/${p.id}/image`, { imageDataUrl: `data:image/png;base64,${PNG.toString('base64')}` }, admin);
    uploaded = up.json?.imageUrl;
    ok('رفع صورة المنتج من اللوحة', up.status === 200 && Boolean(uploaded), up.status + ' ' + JSON.stringify(up.json));
    const appImage = await new Promise((resolve) =>
      http.get({ hostname: '127.0.0.1', port: PORT, path: `/api/products/${p.id}/image` }, (res) => {
        res.resume();
        resolve({ status: res.statusCode, location: res.headers.location });
      })
    );
    ok('صورة التطبيق = الصورة المرفوعة', appImage.status === 302 && appImage.location === `http://127.0.0.1:${PORT}${uploaded}`, JSON.stringify(appImage));
    const feed = await req('GET', '/feeds/meta-catalog.csv');
    const row = feed.text.trim().split('\n')[1] || '';
    ok('الكتالوج: المنتج بصورته', row.startsWith(`"${p.id}","${p.id}"`) && row.includes(uploaded), row);
    ok('الكتالوج: بالدينار', row.includes(`"${Number(p.price).toFixed(2)} LYD"`), row);
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
