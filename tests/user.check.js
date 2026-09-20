#!/usr/bin/env node
// Customer profile, wishlist and invoices - routes with no prior coverage.
//
// What it guards:
//   /api/user/*      a customer's addresses, orders and wishlist - all behind
//                    a session token.
//   /api/invoices/*  admins only. The comments in the code note that both were
//                    once reachable with no session check, so any visitor could
//                    walk small sequential ids to read another customer's order,
//                    or record a payment for an amount of their choosing. These
//                    checks stand guard over that fix.
//
// Hermetic environment: no Postgres, no Odoo - file store and demo catalogue.
// Fresh phone numbers on every run, because the store survives between runs.
//
// Runs with the rest: npm test

const http = require('http');
const { startTestServer } = require('./_server');

const PORT = process.env.TEST_PORT || 3194;
const uniq = () => '09' + Math.floor(10000000 + Math.random() * 89999999);
const ADMIN_PHONE = uniq();
const USER_PHONE = uniq();
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

function req(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
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
          resolve({ status: res.statusCode, json });
        });
      }
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const bearer = (t) => ({ Authorization: 'Bearer ' + t });

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — ملف المستخدم والفواتير ═══\x1b[0m');

  const { server, out } = await startTestServer({
    port: PORT,
    env: { ADMIN_PHONES: ADMIN_PHONE },
  });

  try {
    const user = await req('POST', '/api/auth/register', {
      name: 'عميل',
      phone: USER_PHONE,
      password: 'secret123',
    });
    const tok = user.json && user.json.token;

    console.log('\n\x1b[1m1. لا شيء بلا رمز جلسة\x1b[0m');
    ok('POST addresses ← 401', (await req('POST', '/api/user/addresses', { address: 'ش', city: 'طرابلس' })).status === 401);
    ok('GET orders ← 401', (await req('GET', '/api/user/orders')).status === 401);
    ok('POST wishlist ← 401', (await req('POST', '/api/user/wishlist', { productId: 1 })).status === 401);
    ok('رمز فاسد ← 401', (await req('GET', '/api/user/orders', null, bearer('nope'))).status === 401);

    console.log('\n\x1b[1m2. العناوين\x1b[0m');
    const add = await req('POST', '/api/user/addresses', { address: 'شارع الاختبار', city: 'طرابلس' }, bearer(tok));
    ok('إضافة عنوان (201)', add.status === 201, 'status ' + add.status);
    const addrId = add.json && add.json.address && add.json.address.id;
    ok('الردّ يحمل معرّف العنوان', Boolean(addrId));
    ok('عنوان بلا مدينة يُرفض (400)', (await req('POST', '/api/user/addresses', { address: 'ش' }, bearer(tok))).status === 400);

    const me = await req('GET', '/api/auth/me', null, bearer(tok));
    const addresses = (me.json && me.json.user && me.json.user.addresses) || [];
    ok('العنوان يظهر في /api/auth/me', addresses.some((a) => a.id === addrId));

    ok('حذف العنوان (200)', (await req('DELETE', '/api/user/addresses/' + addrId, null, bearer(tok))).status === 200);
    const me2 = await req('GET', '/api/auth/me', null, bearer(tok));
    const after = (me2.json && me2.json.user && me2.json.user.addresses) || [];
    ok('اختفى بعد الحذف', !after.some((a) => a.id === addrId));

    console.log('\n\x1b[1m3. الطلبات والمفضّلة\x1b[0m');
    const myOrders = await req('GET', '/api/user/orders', null, bearer(tok));
    ok('قراءة الطلبات (200)', myOrders.status === 200, 'status ' + myOrders.status);
    ok('الردّ قائمة', Array.isArray(myOrders.json && myOrders.json.orders));

    const products = await req('GET', '/api/products');
    const pid = products.json && products.json.products && products.json.products[0] && products.json.products[0].id;
    ok('الكتالوج التجريبي فيه منتج', Boolean(pid));

    ok('إضافة للمفضّلة', (await req('POST', '/api/user/wishlist', { productId: pid }, bearer(tok))).status < 300);
    const me3 = await req('GET', '/api/auth/me', null, bearer(tok));
    const wish = (me3.json && me3.json.user && me3.json.user.wishlist) || [];
    ok('تظهر في /api/auth/me', wish.some((w) => Number(w.productId) === Number(pid)), JSON.stringify(wish));
    ok('حذفها من المفضّلة', (await req('DELETE', '/api/user/wishlist/' + pid, null, bearer(tok))).status < 300);
    const me4 = await req('GET', '/api/auth/me', null, bearer(tok));
    const wish2 = (me4.json && me4.json.user && me4.json.user.wishlist) || [];
    ok('اختفت بعد الحذف', !wish2.some((w) => Number(w.productId) === Number(pid)));

    console.log('\n\x1b[1m4. الفواتير — للمديرين وحدهم\x1b[0m');
    ok('GET بلا رمز ← 401', (await req('GET', '/api/invoices/1')).status === 401);
    ok('POST بلا رمز ← 401', (await req('POST', '/api/invoices/1', { amount: 999 })).status === 401);
    ok('GET برمز عميل ← 403', (await req('GET', '/api/invoices/1', null, bearer(tok))).status === 403);
    ok(
      'POST برمز عميل ← 403',
      (await req('POST', '/api/invoices/1', { amount: 999 }, bearer(tok))).status === 403
    );
  } catch (e) {
    fail++;
    failures.push('خطأ غير متوقع: ' + e.message);
    console.error('\x1b[31m' + e.stack + '\x1b[0m');
  } finally {
    server.kill();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(
    '\x1b[1mالنتيجة:\x1b[0m \x1b[32m' + pass + ' ناجح\x1b[0m / ' + (pass + fail) +
      (fail ? ' — \x1b[31m' + fail + ' فاشل\x1b[0m' : '')
  );
  if (fail) {
    console.log('\n\x1b[31mالاختبارات الفاشلة:\x1b[0m');
    failures.forEach((f) => console.log('  • ' + f));
  }
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
}

run();
