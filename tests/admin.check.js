#!/usr/bin/env node
// Dashboard routes - src/routes/admin.js.
//
// What it guards: nineteen routes that had no coverage at all. The danger here
// is not a crash but a leak - requireAdmin is all that stands between customer
// data and settings and any visitor. So the test starts by proving the door is
// locked, before unlocking it with its own key.
//
// An admin is identified by phone through ADMIN_PHONES (see src/lib/auth.js),
// so the test sets it in the spawned server's environment and registers with
// that number - no seed, no database.
//
// Hermetic environment: no Postgres, no Odoo. Whatever needs Odoo is checked
// to return a clear error rather than falling over.
//
// Runs with the rest: npm test

const http = require('http');
const { startTestServer } = require('./_server');

const PORT = process.env.TEST_PORT || 3195;
// A fresh number on every run: the file store survives between runs, so a
// fixed one gets 409 the second time and the test fails through no fault of the code.
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — لوحة التحكّم ═══\x1b[0m');

  const { server, out } = await startTestServer({
    port: PORT,
    env: { ADMIN_PHONES: ADMIN_PHONE },
  });

  try {
    console.log('\n\x1b[1m1. البوابة\x1b[0m');
    ok('بلا رمز ← 401', (await req('GET', '/api/admin/overview')).status === 401);
    ok('برمز فاسد ← 401', (await req('GET', '/api/admin/overview', null, bearer('nope'))).status === 401);

    const plain = await req('POST', '/api/auth/register', {
      name: 'عميل عادي',
      phone: USER_PHONE,
      password: 'secret123',
    });
    ok('مستخدم عادي يُسجَّل', plain.status === 201, 'status ' + plain.status);
    ok(
      'مستخدم عادي ← 403 لا 200',
      (await req('GET', '/api/admin/overview', null, bearer(plain.json && plain.json.token))).status === 403
    );

    const admin = await req('POST', '/api/auth/register', {
      name: 'مدير',
      phone: ADMIN_PHONE,
      password: 'secret123',
    });
    ok('المدير يُسجَّل', admin.status === 201, 'status ' + admin.status);
    const tok = admin.json && admin.json.token;

    console.log('\n\x1b[1m2. القراءة\x1b[0m');
    const ov = await req('GET', '/api/admin/overview', null, bearer(tok));
    ok('overview (200)', ov.status === 200, 'status ' + ov.status);
    ok('overview يحمل كائناً', ov.json !== null && typeof ov.json === 'object');
    ok('orders (200)', (await req('GET', '/api/admin/orders', null, bearer(tok))).status === 200);
    ok('customers (200)', (await req('GET', '/api/admin/customers', null, bearer(tok))).status === 200);
    ok('products (200)', (await req('GET', '/api/admin/products', null, bearer(tok))).status === 200);

    console.log('\n\x1b[1m3. الإعدادات\x1b[0m');
    const odooGet = await req('GET', '/api/admin/settings/odoo', null, bearer(tok));
    ok('قراءة إعداد أودو (200)', odooGet.status === 200, 'status ' + odooGet.status);
    ok('الردّ لا يحمل مفتاح API', !JSON.stringify(odooGet.json || {}).includes('apiKey'));
    ok('حقل lastError موجود', odooGet.json !== null && 'lastError' in odooGet.json);

    const pxPut = await req('PUT', '/api/admin/settings/facebook-pixel', { pixelId: '1234567890' }, bearer(tok));
    ok('حفظ معرّف البكسل', pxPut.status === 200, 'status ' + pxPut.status);
    const pxPub = await req('GET', '/api/pixel-config');
    ok('يظهر في النقطة العامة', pxPub.json && pxPub.json.pixelId === '1234567890', JSON.stringify(pxPub.json));
    ok('حذفه (200)', (await req('DELETE', '/api/admin/settings/facebook-pixel', null, bearer(tok))).status === 200);
    ok('اختفى من النقطة العامة', !(await req('GET', '/api/pixel-config')).json.pixelId);

    const waPut = await req('PUT', '/api/admin/settings/whatsapp-support', { phone: '0911234567' }, bearer(tok));
    ok('حفظ رقم دعم واتساب', waPut.status === 200, 'status ' + waPut.status);
    ok(
      'حذفه (200)',
      (await req('DELETE', '/api/admin/settings/whatsapp-support', null, bearer(tok))).status === 200
    );

    console.log('\n\x1b[1m4. إبطال ذاكرة الكتالوج\x1b[0m');
    // These three invalidate the catalogue cache. They used to assign to
    // productCache, which is defined in server.js - so once they moved to
    // routes/admin.js they threw ReferenceError and returned 502, while the
    // whole suite stayed green because the check here accepted "any error".
    // It now demands success outright: an exact status, not a wide range.
    const sync = await req('POST', '/api/admin/sync', null, bearer(tok));
    ok('sync (200)', sync.status === 200, 'status ' + sync.status);
    ok('sync يذكر المصدر', Boolean(sync.json && sync.json.source), JSON.stringify(sync.json));

    const odooDel = await req('DELETE', '/api/admin/settings/odoo', null, bearer(tok));
    ok('حذف إعداد أودو (200)', odooDel.status === 200, 'status ' + odooDel.status);
    ok('الخادم ما زال حيّاً', (await req('GET', '/api/health')).status === 200);
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
