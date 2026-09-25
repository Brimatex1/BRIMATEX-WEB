#!/usr/bin/env node
// Customer reviews on the product page - src/lib/perks.js, GET
// /api/products/:id/reviews and /api/admin/reviews.
//
// - only a product in the reviewer's own order can be reviewed
// - a review shows at once, with the average and the author's first name only
// - an admin sees every review with its author, and can hide and show it
//
// Runs with the rest: npm test

'use strict';

const http = require('http');
const { startTestServer } = require('./_server');

const PORT = process.env.TEST_PORT || 3183;
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
          resolve({ status: res.statusCode, json, type: res.headers['content-type'], raw });
        });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const { server } = await startTestServer({ port: PORT, env: { ADMIN_PHONES: ADMIN_PHONE } });
  try {
    const register = async (phone, name) =>
      (await req('POST', '/api/auth/register', { name, phone, password: 'secret1' })).json.token;
    const admin = await register(ADMIN_PHONE, 'المدير');
    const buyer = await register(uniq(), 'سالم بن علي');
    const products = (await req('GET', '/api/products')).json.products;
    const [p, other] = products;
    const customer = { name: 'سالم بن علي', phone: uniq(), city: 'طرابلس', address: 'شارع التجربة' };
    const order = await req('POST', '/api/orders', { customer, items: [{ productId: p.id, quantity: 1 }], note: '', channel: 'web' }, buyer);
    const orderName = order.json?.orderName;
    ok('طلب للتجربة', (order.status === 200 || order.status === 201) && Boolean(orderName), JSON.stringify(order.json));

    const wrong = await req('POST', '/api/user/reviews', { productId: other.id, orderName, rating: 5, comment: 'ممتازة' }, buyer);
    ok('منتج ليس في الطلب: مرفوض', wrong.status === 400, `${wrong.status} ${JSON.stringify(wrong.json)}`);

    // The demo store keeps other tests' reviews, so counts are relative to here.
    const before = (await req('GET', `/api/products/${p.id}/reviews`)).json;
    ok('قائمة التقييمات تُقرأ بلا جلسة', typeof before.count === 'number');
    ok('بلا تقييمات: لا متوسط', (await req('GET', '/api/products/987654/reviews')).json.average === null);

    const added = await req('POST', '/api/user/reviews', { productId: p.id, orderName, rating: 4, comment: 'مريحة جداً' }, buyer);
    ok('تقييم منتج في الطلب', added.status === 201, `${added.status} ${JSON.stringify(added.json)}`);

    const shown = (await req('GET', `/api/products/${p.id}/reviews`)).json;
    const r = shown.reviews.find((x) => x.id === added.json.review.id);
    ok('يظهر مباشرة ويُحسب', shown.count === before.count + 1 && typeof shown.average === 'number' && r?.comment === 'مريحة جداً');
    ok('الاسم الأول فقط', r?.name === 'سالم', r?.name);
    ok('بلا هاتف ولا معرّف المستخدم', !('phone' in r) && !('userId' in r) && !JSON.stringify(shown).includes(customer.phone));

    ok('زبون لا يرى قائمة المدير (403)', (await req('GET', '/api/admin/reviews', null, buyer)).status === 403);
    const list = (await req('GET', '/api/admin/reviews', null, admin)).json.reviews;
    const mine = list.find((x) => x.id === r.id);
    ok('المدير يرى التقييم باسمه الكامل', mine?.name === 'سالم بن علي' && mine.hidden === false);

    ok('زبون لا يخبّي (403)', (await req('PATCH', `/api/admin/reviews/${r.id}`, { hidden: true }, buyer)).status === 403);
    const hide = await req('PATCH', `/api/admin/reviews/${r.id}`, { hidden: true }, admin);
    ok('المدير يخبّي', hide.status === 200 && hide.json.hidden === true);
    ok('المخبّأ لا يظهر', (await req('GET', `/api/products/${p.id}/reviews`)).json.count === before.count);
    await req('PATCH', `/api/admin/reviews/${r.id}`, { hidden: false }, admin);
    ok('ويرجع لما يُظهر', (await req('GET', `/api/products/${p.id}/reviews`)).json.count === before.count + 1);
    ok('تقييم غير موجود: 404', (await req('PATCH', '/api/admin/reviews/00000000-0000-4000-8000-000000000000', { hidden: true }, admin)).status === 404);
    ok('قيمة غير صالحة: 400', (await req('PATCH', `/api/admin/reviews/${r.id}`, { hidden: 'yes' }, admin)).status === 400);
  } finally {
    server.kill();
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
