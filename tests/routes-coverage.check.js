#!/usr/bin/env node
// The blind spots - five routes that no test mentioned.
//
// Why this file: splitting server.js into modules exposed a particular class of
// bug - a route referring to an identifier no longer in its scope, throwing
// ReferenceError and returning 502 while the whole suite stayed green. One was
// found for real (productCache, in the admin routes). Three of the five here
// are in that same module.
//
// The lesson learned is applied: an exact status, not a wide range. A check
// that accepts "anything between 400 and 599" swallows precisely the bug we
// are looking for.
//
// Runs with the rest: npm test

const http = require('http');
const { startTestServer } = require('./_server');

const PORT = process.env.TEST_PORT || 3193;
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
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — النقاط العمياء ═══\x1b[0m');

  const { server } = await startTestServer({
    port: PORT,
    env: { ADMIN_PHONES: ADMIN_PHONE, RATE_LIMIT_ORDERS_PER_MIN: '50' },
  });

  try {
    const admin = await req('POST', '/api/auth/register', {
      name: 'مدير',
      phone: ADMIN_PHONE,
      password: 'secret123',
    });
    const tok = admin.json && admin.json.token;
    const customer = await req('POST', '/api/auth/register', {
      name: 'عميل',
      phone: USER_PHONE,
      password: 'secret123',
    });
    const custTok = customer.json && customer.json.token;
    const custId = customer.json && customer.json.user && customer.json.user.id;

    console.log('\n\x1b[1m1. إعدادات واتساب العامة\x1b[0m');
    const wa = await req('GET', '/api/whatsapp-config');
    ok('GET /api/whatsapp-config (200)', wa.status === 200, 'status ' + wa.status);
    ok('الردّ يحمل phone وmessage', wa.json !== null && 'phone' in wa.json && 'message' in wa.json);

    console.log('\n\x1b[1m2. تسجيل جهاز للإشعارات\x1b[0m');
    const good = await req('POST', '/api/devices', {
      token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
      platform: 'ios',
      orderName: null,
    });
    ok('رمز Expo صالح يُقبل (200)', good.status === 200, 'status ' + good.status);
    const bad = await req('POST', '/api/devices', { token: 'ليس-رمزاً', platform: 'ios' });
    ok('رمز غير صالح يُرفض (400)', bad.status === 400, 'status ' + bad.status);

    console.log('\n\x1b[1m3. اختبار اتصال أودو\x1b[0m');
    ok('بلا رمز ← 401', (await req('POST', '/api/admin/settings/odoo/test')).status === 401);
    ok('برمز عميل ← 403', (await req('POST', '/api/admin/settings/odoo/test', null, bearer(custTok))).status === 403);
    const odooTest = await req('POST', '/api/admin/settings/odoo/test', null, bearer(tok));
    ok('بلا إعداد ← 400 لا 502', odooTest.status === 400, 'status ' + odooTest.status);

    console.log('\n\x1b[1m4. تعديل حالة طلب\x1b[0m');
    const products = await req('GET', '/api/products');
    const p = products.json && products.json.products && products.json.products[0];
    const made = await req('POST', '/api/orders', {
      customer: { name: 'عميل', phone: USER_PHONE, city: 'طرابلس', address: 'شارع الاختبار' },
      items: [{ productId: p.id, quantity: 1 }],
    });
    ok('أُنشئ طلب للاختبار (201)', made.status === 201, 'status ' + made.status);
    const name = made.json && made.json.orderName;

    ok('بلا رمز ← 401', (await req('PATCH', '/api/admin/orders/' + encodeURIComponent(name), { paymentStatus: 'paid' })).status === 401);
    const badPay = await req('PATCH', '/api/admin/orders/' + encodeURIComponent(name), { paymentStatus: 'لا-شيء' }, bearer(tok));
    ok('حالة دفع مجهولة ← 400', badPay.status === 400, 'status ' + badPay.status);
    const badInv = await req('PATCH', '/api/admin/orders/' + encodeURIComponent(name), { invoiceStatus: 'لا-شيء' }, bearer(tok));
    ok('حالة طلب مجهولة ← 400', badInv.status === 400, 'status ' + badInv.status);
    const okPay = await req('PATCH', '/api/admin/orders/' + encodeURIComponent(name), { paymentStatus: 'paid' }, bearer(tok));
    ok('تعليمه مدفوعاً (200)', okPay.status === 200, 'status ' + okPay.status);

    console.log('\n\x1b[1m5. تعديل دور مستخدم\x1b[0m');
    ok('بلا رمز ← 401', (await req('PATCH', '/api/admin/users/' + custId, { role: 'admin' })).status === 401);
    ok('برمز عميل ← 403', (await req('PATCH', '/api/admin/users/' + custId, { role: 'admin' }, bearer(custTok))).status === 403);
    const badRole = await req('PATCH', '/api/admin/users/' + custId, { role: 'سلطان' }, bearer(tok));
    ok('دور مجهول ← 400', badRole.status === 400, 'status ' + badRole.status);
    const okRole = await req('PATCH', '/api/admin/users/' + custId, { role: 'admin' }, bearer(tok));
    ok('ترقية إلى admin (200)', okRole.status === 200, 'status ' + okRole.status);
    ok(
      'العميل المُرقّى صار يصل لوحة التحكّم',
      (await req('GET', '/api/admin/overview', null, bearer(custTok))).status === 200
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
