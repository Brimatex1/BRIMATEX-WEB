#!/usr/bin/env node
// Order idempotency - POST /api/orders must not create two orders for one
// checkout attempt.
//
// The scenario it protects: the order reaches the server and is recorded, then
// the network drops before the reply gets back to the phone. The app sees a
// timeout, keeps the cart and shows "try again", and the second tap carries the
// same key - so the server must return the first order rather than opening a
// second one.
//
// Runs with the rest: npm test

const http = require('http');
const path = require('path');
const { startTestServer } = require('./_server');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || 3198;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            /* not JSON */
          }
          resolve({ status: res.statusCode, json, body: raw });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const customer = {
  name: 'عميل اختبار التفرّد',
  phone: '0912345678',
  city: 'طرابلس',
  address: 'شارع الاختبار، عمارة 1',
};

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — تفرّد الطلبات ═══\x1b[0m\n');

  const { server } = await startTestServer({
    port: PORT,
    env: { RATE_LIMIT_ORDERS_PER_MIN: '200' },
  });

  try {
    const products = await request('GET', '/api/products');
    const product = (products.json?.products || []).find((p) => p.enabled !== false);
    if (!product) throw new Error('لا منتجات في الكتالوج');

    // No skipping any more: the server is spawned with no Odoo credentials (see
    // the spawn environment above), so orders land on the demo catalogue and the
    // file store alone.

    const order = { customer, items: [{ productId: product.id, quantity: 1 }] };
    const key = `req_test_${Date.now().toString(36)}`;

    console.log('\x1b[1m1. المفتاح نفسه لا يصنع طلباً ثانياً\x1b[0m');
    const first = await request('POST', '/api/orders', { ...order, requestId: key });
    check('المحاولة الأولى تُنشئ الطلب (201)', first.status === 201, `status ${first.status}`);
    check('الاستجابة تحمل رقم الطلب', Boolean(first.json?.orderName));

    const retry = await request('POST', '/api/orders', { ...order, requestId: key });
    check('إعادة المحاولة تُقبل (200 لا 201)', retry.status === 200, `status ${retry.status}`);
    check('الاستجابة معلَّمة replayed', retry.json?.replayed === true);
    check(
      'رقم الطلب هو نفسه لا رقم جديد',
      retry.json?.orderName === first.json?.orderName,
      `${first.json?.orderName} ≠ ${retry.json?.orderName}`
    );

    console.log('\n\x1b[1m2. محاولة جديدة تعني طلباً جديداً\x1b[0m');
    const other = await request('POST', '/api/orders', {
      ...order,
      requestId: `${key}_b`,
    });
    check('مفتاح مختلف يُنشئ طلباً (201)', other.status === 201, `status ${other.status}`);
    check(
      'رقمه يختلف عن الأول',
      other.json?.orderName && other.json.orderName !== first.json?.orderName
    );

    console.log('\n\x1b[1m3. التوافق مع عميل قديم بلا مفتاح\x1b[0m');
    const bare1 = await request('POST', '/api/orders', order);
    const bare2 = await request('POST', '/api/orders', order);
    check('طلب بلا مفتاح يُقبل (201)', bare1.status === 201, `status ${bare1.status}`);
    check(
      'طلبان بلا مفتاح يبقيان منفصلين',
      bare1.json?.orderName && bare2.json?.orderName !== bare1.json?.orderName,
      'مفتاح مفقود لا يجوز أن يُدمج مع طلب آخر'
    );

    console.log('\n\x1b[1m4. السجلّ\x1b[0m');
    const stored = require('../src/lib/orders');
    const replayed = await stored.getOrderByRequestId(key);
    check('الطلب يُسترجع بمفتاحه', replayed?.orderName === first.json?.orderName);
    check('مفتاح مجهول يعيد null', (await stored.getOrderByRequestId('req_لا_وجود_له')) === null);
    check('مفتاح فارغ يعيد null', (await stored.getOrderByRequestId('')) === null);
  } catch (err) {
    fail++;
    failures.push('خطأ غير متوقع: ' + err.message);
    console.error('\x1b[31m' + err.stack + '\x1b[0m');
  } finally {
    server.kill();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(
    `\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` +
      (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : '')
  );
  if (fail) {
    console.log('\n\x1b[31mالاختبارات الفاشلة:\x1b[0m');
    failures.forEach((f) => console.log('  • ' + f));
  }
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
}

run();
