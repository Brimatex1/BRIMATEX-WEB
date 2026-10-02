#!/usr/bin/env node
// The admin panel's routes - src/routes/panel.js, src/lib/panel.js.
//
// What it guards: the panel shows every customer's orders and confirms them in
// Odoo, so each route checks the caller's role against its section - reads
// included. The test proves the doors per role first (customer, marketing,
// support, admin), then the orders list's filters and the confirm action.
//
// Hermetic environment: no Postgres, no Odoo - orders are demo ones in the
// file store, so «تأكيد» changes the local record only.
//
// Runs with the rest: npm test

'use strict';

const http = require('http');
const { startTestServer } = require('./_server');
const panel = require('../src/lib/panel');

const PORT = process.env.TEST_PORT || 3201;
const uniq = () => '09' + Math.floor(10000000 + Math.random() * 89999999);
const ADMIN_PHONE = uniq();
// A city no other test orders to, so the file store's older orders stay out of the counts.
const CITY = 'مدينة-' + Math.random().toString(36).slice(2, 8);

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
        path: encodeURI(urlPath),
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
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
          resolve({ status: res.statusCode, json, text: raw });
        });
      }
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const bearer = (t) => ({ Authorization: 'Bearer ' + t });

async function register(name, phone) {
  const r = await req('POST', '/api/auth/register', { name, phone, password: 'secret123' });
  return { token: r.json?.token, id: r.json?.user?.id, status: r.status };
}

/** A delivery day the server accepts: after today, not a Friday. */
function deliveryDay() {
  const d = new Date(Date.now() + 3 * 86_400_000);
  if (d.getUTCDay() === 5) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function unit() {
  console.log('\n\x1b[1m0. القواعد (src/lib/panel.js)\x1b[0m');
  ok('جديد', panel.statusOf({ invoiceStatus: 'draft', paymentStatus: 'unpaid' }) === 'new');
  ok('مؤكد', panel.statusOf({ invoiceStatus: 'confirmed' }) === 'confirmed');
  ok('مؤكد ويُصنع ← قيد التجهيز', panel.statusOf({ invoiceStatus: 'confirmed', note: 'طلب مسبق — يُصنع خلال 10 أيام: بالانس' }) === 'preparing');
  ok('خرج للتوصيل', panel.statusOf({ invoiceStatus: 'posted' }) === 'out');
  ok('تم التسليم', panel.statusOf({ invoiceStatus: 'posted', paymentStatus: 'paid' }) === 'delivered');
  ok('ملغي', panel.statusOf({ invoiceStatus: 'cancel' }) === 'cancelled');

  const index = panel.platformIndex([
    { platform: 'ios', lastOrder: 'A-1', userId: null },
    { platform: 'android', lastOrder: null, userId: 'u1' },
  ]);
  ok('القناة: الموقع', panel.channelOf({ channel: 'web' }, index) === 'web');
  ok('القناة: طلب قديم بلا قناة = الموقع', panel.channelOf({}, index) === 'web');
  ok('القناة: iOS من جهاز الطلب', panel.channelOf({ channel: 'app', orderName: 'A-1' }, index) === 'ios');
  ok('القناة: أندرويد من أجهزة الحساب', panel.channelOf({ channel: 'app', orderName: 'A-2', userId: 'u1' }, index) === 'android');
  ok('القناة: التطبيق حين لا يُعرف الجهاز', panel.channelOf({ channel: 'app', orderName: 'A-3' }, index) === 'app');

  const now = new Date('2026-10-02T23:30:00Z'); // 01:30 on 3 October in Libya
  ok('اليوم بتوقيت ليبيا', panel.periodStart('today', now) === '2026-10-03');
  ok('آخر 7 أيام', panel.periodStart('7d', now) === '2026-09-27');
  ok('الكل بلا حد', panel.periodStart('all', now) === '');

  const q = panel.readQuery(new URLSearchParams('status=bogus&channel=x&period=y&perPage=500&page=-3'));
  ok('قيم مجهولة ← الافتراضي', q.status === 'all' && q.channel === 'all' && q.period === 'today' && q.page === 1);
  ok('الصفحة 8 إلى 20 طلباً', q.perPage === 20 && panel.readQuery(new URLSearchParams('perPage=2')).perPage === 8);

  ok('موعد التوصيل من الملاحظة', panel.deliveryFromNote('الاستلام: توصيل إلى المنزل\nموعد التوصيل: السبت 3 أكتوبر · صباحاً') === 'السبت 3 أكتوبر · صباحاً');
  ok('الاستلام من الصالة', panel.deliveryFromNote('الاستلام: استلام من الصالة') === 'استلام من الصالة');
}

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — لوحة الإدارة الجديدة ═══\x1b[0m');
  unit();

  const { server, out } = await startTestServer({
    port: PORT,
    env: { ADMIN_PHONES: ADMIN_PHONE, RATE_LIMIT_ORDERS_PER_MIN: '200' },
  });

  try {
    console.log('\n\x1b[1m1. البوابة\x1b[0m');
    for (const path of ['/api/panel/me', '/api/panel/overview', '/api/panel/orders']) {
      ok(`${path} بلا رمز ← 401`, (await req('GET', path)).status === 401);
    }
    ok('برمز فاسد ← 401', (await req('GET', '/api/panel/me', null, bearer('nope'))).status === 401);

    const admin = await register('المدير', ADMIN_PHONE);
    const customer = await register('عميل', uniq());
    const marketing = await register('التسويق', uniq());
    const support = await register('خدمة العملاء', uniq());
    ok('الحسابات تُسجَّل', [admin, customer, marketing, support].every((a) => a.status === 201 && a.token));

    const cust = await req('GET', '/api/panel/me', null, bearer(customer.token));
    ok('العميل ← 403 ليست لديك صلاحية', cust.status === 403 && cust.json?.code === 'not_staff', 'status ' + cust.status);
    ok('العميل لا يقرأ الطلبات', (await req('GET', '/api/panel/orders', null, bearer(customer.token))).status === 403);

    console.log('\n\x1b[1m2. الأدوار\x1b[0m');
    const me = await req('GET', '/api/panel/me', null, bearer(admin.token));
    ok('المدير: كل الأقسام السبعة', me.status === 200 && me.json?.role === 'admin' && me.json?.sections?.length === 7);
    ok('المدير يؤكد', me.json?.canConfirm === true);

    ok('دور مجهول ← 400', (await req('PATCH', `/api/panel/users/${marketing.id}/role`, { role: 'سلطان' }, bearer(admin.token))).status === 400);
    ok('لا يُعدَّل مدير ADMIN_PHONES ← 409', (await req('PATCH', `/api/panel/users/${admin.id}/role`, { role: 'support' }, bearer(admin.token))).status === 409);
    ok('مستخدم غير موجود ← 404', (await req('PATCH', '/api/panel/users/nobody/role', { role: 'support' }, bearer(admin.token))).status === 404);
    ok('تعيين تسويق', (await req('PATCH', `/api/panel/users/${marketing.id}/role`, { role: 'marketing' }, bearer(admin.token))).status === 200);
    ok('تعيين خدمة العملاء', (await req('PATCH', `/api/panel/users/${support.id}/role`, { role: 'support' }, bearer(admin.token))).status === 200);
    ok('العميل لا يعيّن الأدوار ← 403', (await req('PATCH', `/api/panel/users/${customer.id}/role`, { role: 'admin' }, bearer(customer.token))).status === 403);

    const team = await req('GET', '/api/panel/users', null, bearer(admin.token));
    ok('قائمة الفريق تضم الدورين', team.status === 200 && ['marketing', 'support'].every((r) => team.json.users.some((u) => u.role === r)));

    const mk = await req('GET', '/api/panel/me', null, bearer(marketing.token));
    ok('التسويق: الواجهة، الإشعارات، ساعدني أختار، المراتب', mk.status === 200 && mk.json.sections.join() === 'home,push,quiz,products', JSON.stringify(mk.json?.sections));
    ok('التسويق بلا عدّاد طلبات', mk.json?.badges?.orders === null);
    ok('التسويق لا يرى نظرة عامة ← 403', (await req('GET', '/api/panel/overview', null, bearer(marketing.token))).status === 403);
    ok('التسويق لا يرى الطلبات ← 403', (await req('GET', '/api/panel/orders', null, bearer(marketing.token))).status === 403);
    ok('التسويق لا يرى الفريق ← 403', (await req('GET', '/api/panel/users', null, bearer(marketing.token))).status === 403);

    const sp = await req('GET', '/api/panel/me', null, bearer(support.token));
    ok('خدمة العملاء: نظرة عامة، الطلبات', sp.status === 200 && sp.json.sections.join() === 'overview,orders', JSON.stringify(sp.json?.sections));
    ok('خدمة العملاء تؤكد', sp.json?.canConfirm === true);
    ok('خدمة العملاء ترى نظرة عامة', (await req('GET', '/api/panel/overview', null, bearer(support.token))).status === 200);
    ok('خدمة العملاء لا تعيّن الأدوار ← 403', (await req('PATCH', `/api/panel/users/${customer.id}/role`, { role: 'admin' }, bearer(support.token))).status === 403);
    ok('خدمة العملاء لا تدخل اللوحة القديمة ← 403', (await req('GET', '/api/admin/overview', null, bearer(support.token))).status === 403);

    console.log('\n\x1b[1m3. الطلبات والمرشّحات\x1b[0m');
    const products = await req('GET', '/api/products');
    const product = (products.json?.products || []).find((p) => p.enabled !== false);
    const base = (name) => ({
      customer: { name, phone: '0912345678', city: CITY, address: 'شارع الاختبار' },
      items: [{ productId: product.id, quantity: 1 }],
    });
    const web = await req('POST', '/api/orders', { ...base('زبون الموقع'), channel: 'web' });
    const app = await req('POST', '/api/orders', {
      ...base('زبون التطبيق'),
      channel: 'app',
      requestId: 'req_panel_' + Date.now().toString(36),
      delivery: { method: 'home', date: deliveryDay(), slot: 'evening' },
      paymentMethod: 'cash',
    });
    const android = await req('POST', '/api/orders', { ...base('زبون أندرويد'), channel: 'app', requestId: 'req_panel_a_' + Date.now().toString(36) });
    ok('ثلاثة طلبات تجريبية', [web, app, android].every((r) => r.status === 201), [web, app, android].map((r) => r.status).join());
    // Android's device registers for its order - the iOS / Android split.
    await req('POST', '/api/devices', { token: `ExponentPushToken[panel${Date.now()}]`, platform: 'android', orderName: android.json?.orderName });

    const list = async (query, tok = support.token) => req('GET', `/api/panel/orders?city=${CITY}&period=today&${query}`, null, bearer(tok));
    const all = await list('');
    ok('المدينة واليوم: ثلاثة', all.status === 200 && all.json.total === 3 && all.json.counts.all === 3, JSON.stringify(all.json?.counts));
    ok('كلها جديدة', all.json?.counts.new === 3);
    ok('المدينة ضمن الخيارات', all.json?.cities.includes(CITY));
    const appRow = all.json?.orders.find((o) => o.orderName === app.json?.orderName);
    ok('صف الطلب: القناة والمنتجات والموعد والدفع', appRow?.channel === 'app' && appRow.products && appRow.delivery?.includes('مساءً') && appRow.payment === 'نقداً', JSON.stringify(appRow));
    ok('لا رابط أودو بلا أودو', appRow?.odooLink === null);
    ok('أندرويد', (await list('channel=android')).json?.orders.map((o) => o.orderName).join() === android.json?.orderName);
    ok('الموقع', (await list('channel=web')).json?.orders.map((o) => o.orderName).join() === web.json?.orderName);
    ok('التطبيق (كل المنصات): اثنان', (await list('channel=app')).json?.total === 2);
    ok('البحث بالاسم', (await list('q=' + 'زبون الموقع')).json?.total === 1);
    ok('مدينة أخرى: لا شيء', (await req('GET', '/api/panel/orders?city=nowhere&period=all', null, bearer(support.token))).json?.total === 0);
    const paged = await list('perPage=8&page=9');
    ok('صفحة خارج المدى ← آخر صفحة', paged.json?.page === 1 && paged.json?.pages === 1);

    console.log('\n\x1b[1m4. التأكيد\x1b[0m');
    const target = encodeURIComponent(app.json?.orderName);
    ok('بلا رمز ← 401', (await req('POST', `/api/panel/orders/${target}/confirm`)).status === 401);
    ok('العميل ← 403', (await req('POST', `/api/panel/orders/${target}/confirm`, null, bearer(customer.token))).status === 403);
    ok('التسويق ← 403', (await req('POST', `/api/panel/orders/${target}/confirm`, null, bearer(marketing.token))).status === 403);
    ok('طلب غير موجود ← 404', (await req('POST', '/api/panel/orders/NOPE-1/confirm', null, bearer(support.token))).status === 404);
    const confirmed = await req('POST', `/api/panel/orders/${target}/confirm`, null, bearer(support.token));
    ok('خدمة العملاء تؤكد ← 200 مؤكد', confirmed.status === 200 && confirmed.json?.order?.status === 'confirmed', 'status ' + confirmed.status);
    // The admin passes the guard too: the answer is about the order, not the role.
    ok('المدير، مرة ثانية ← 409', (await req('POST', `/api/panel/orders/${target}/confirm`, null, bearer(admin.token))).status === 409);
    const after = await list('');
    ok('العدّاد: جديد 2، مؤكد 1', after.json?.counts.new === 2 && after.json?.counts.confirmed === 1, JSON.stringify(after.json?.counts));
    ok('مرشّح الحالة', (await list('status=confirmed')).json?.orders.map((o) => o.orderName).join() === app.json?.orderName);

    // Cancelled from the classic dashboard: not confirmable.
    await req('PATCH', `/api/admin/orders/${encodeURIComponent(web.json?.orderName)}`, { invoiceStatus: 'cancelled' }, bearer(admin.token));
    ok('طلب ملغى ← 409', (await req('POST', `/api/panel/orders/${encodeURIComponent(web.json?.orderName)}/confirm`, null, bearer(admin.token))).status === 409);

    console.log('\n\x1b[1m5. نظرة عامة\x1b[0m');
    const ov = await req('GET', '/api/panel/overview', null, bearer(admin.token));
    ok('200', ov.status === 200, 'status ' + ov.status);
    ok('طلبات اليوم ثلاثة على الأقل', ov.json?.today?.orders >= 3);
    ok('القنوات: iOS وأندرويد والموقع', ['ios', 'android', 'web'].every((k) => ov.json?.channels.some((c) => c.key === k)));
    ok('للمدير: التقييمات والصور', typeof ov.json?.reviewsPending === 'number' && typeof ov.json?.productsWithoutPhoto?.total === 'number');
    const ovSupport = await req('GET', '/api/panel/overview', null, bearer(support.token));
    ok('لخدمة العملاء: بلا تقييمات ولا صور', ovSupport.json?.reviewsPending === null && ovSupport.json?.productsWithoutPhoto === null);

    console.log('\n\x1b[1m6. العناوين\x1b[0m');
    for (const path of ['/admin', '/admin/orders', '/admin/settings', '/admin/classic']) {
      const r = await req('GET', path);
      ok(`${path} ← 200 الواجهة`, r.status === 200 && r.text.includes('<div id="root">'), 'status ' + r.status);
    }
    ok('/admin/nope ← 404', (await req('GET', '/admin/nope')).status === 404);
    ok('robots.txt يمنع /admin', (await req('GET', '/robots.txt')).text.includes('Disallow: /admin'));
  } catch (err) {
    fail++;
    failures.push('استثناء: ' + err.message);
    console.error(err);
    console.error(out.text);
  } finally {
    server.kill();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
  if (fail) {
    console.log('\x1b[31m' + failures.map((f) => '  - ' + f).join('\n') + '\x1b[0m');
    process.exit(1);
  }
}

run();
