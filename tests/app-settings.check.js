#!/usr/bin/env node
// The panel's «الإعدادات» and the public config - src/lib/appSettings.js,
// /api/panel/settings, /api/app/v1/config.
//
// What it guards:
//   - only an admin reads or writes the settings (marketing and support cannot);
//   - every value is checked on the server (versions, switches, Libyan numbers,
//     the email, quiet hours);
//   - the public config is cached for 5 minutes and replaced the moment the
//     panel saves;
//   - maintenance stops POST /api/orders on the server, not only in the clients;
//   - with Odoo, the settings are the system parameter brimatex.app.settings,
//     and an Odoo that refuses the write (no rights) answers 503 and keeps the
//     old value. A small fake Odoo plays that part.
//
// Each server keeps its own settings file (BRIMATEX_SETTINGS_FILE), so
// switching maintenance on here never touches a developer's copy.
//
// Runs with the rest: npm test

'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { startTestServer } = require('./_server');
const appSettings = require('../src/lib/appSettings');

const PORT = Number(process.env.TEST_PORT || 3211);
const ODOO_PORT = PORT + 1;
const FAKE_ODOO_PORT = PORT + 2;
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

function req(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port,
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
          resolve({ status: res.statusCode, json, text: raw, headers: res.headers });
        });
      }
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const bearer = (t) => ({ Authorization: 'Bearer ' + t });

function tempFile(name) {
  const file = path.join(os.tmpdir(), `brimatex-${name}-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(file, '{}\n');
  return file;
}

function unit() {
  console.log('\n\x1b[1m0. القواعد (src/lib/appSettings.js)\x1b[0m');
  const d = appSettings.defaults();
  ok('الافتراضي: بلا إجبار وبلا صيانة والزائر مسموح', d.forceUpdate === false && d.maintenance.on === false && d.guestBrowsing === true);
  ok('الافتراضي: الهدوء 22:00 إلى 08:00', d.quietHours.from === '22:00' && d.quietHours.to === '08:00');
  ok('الافتراضي: تواصل الموقع', d.contact.phone === '0935770070' && d.contact.email === 'info@brimatex.ly' && d.contact.showroom === 'النوفليين، طرابلس');
  ok('رقم دولي ← محلي', appSettings.libyanNumber('+218 93-577-0070') === '0935770070');
  ok('00218 ← محلي', appSettings.libyanNumber('00218912345678') === '0912345678');
  ok('أرقام عربية', appSettings.libyanNumber('٠٩١٢٣٤٥٦٧٨') === '0912345678');
  ok('هاتف أرضي لخدمة العملاء', appSettings.libyanNumber('021 444 5566') === '0214445566');
  ok('الأرضي ليس واتساب', appSettings.libyanNumber('0214445566', { mobile: true }) === null);
  ok('رقم أجنبي مرفوض', appSettings.libyanNumber('+44 20 7946 0958') === null);
  const junk = appSettings.complete({ minVersion: { ios: 'abc' }, forceUpdate: true, quietHours: 'x' });
  ok('قيمة مخزّنة فاسدة ← افتراضيها فقط', junk.minVersion.ios === '1.0.0' && junk.forceUpdate === true && junk.quietHours.from === '22:00');
  const pub = appSettings.publicConfig(d);
  ok('الإعداد العام: رسالة الصيانة فارغة وهي متوقفة', pub.settings.maintenance.message === '');
}

async function register(port, name, phone) {
  const r = await req(port, 'POST', '/api/auth/register', { name, phone, password: 'secret123' });
  return { token: r.json?.token, id: r.json?.user?.id, status: r.status };
}

async function localServer() {
  const ADMIN_PHONE = uniq();
  const file = tempFile('settings');
  const { server, out } = await startTestServer({
    port: PORT,
    env: { ADMIN_PHONES: ADMIN_PHONE, BRIMATEX_SETTINGS_FILE: file, RATE_LIMIT_ORDERS_PER_MIN: '200' },
  });
  const r = (...args) => req(PORT, ...args);
  try {
    console.log('\n\x1b[1m1. الإعداد العام /api/app/v1/config\x1b[0m');
    const cfg = await r('GET', '/api/app/v1/config');
    ok('بلا دخول ← 200', cfg.status === 200, 'status ' + cfg.status);
    ok('Cache-Control: public, max-age=300', cfg.headers['cache-control'] === 'public, max-age=300', cfg.headers['cache-control']);
    const s = cfg.json?.settings;
    ok('الافتراضي اليوم', s?.forceUpdate === false && s?.maintenance?.on === false && s?.guestBrowsing === true && s?.quietHours?.from === '22:00', JSON.stringify(s));
    ok('الإصدار الأدنى للمنصتين', s?.minVersion?.ios === '1.0.0' && s?.minVersion?.android === '1.0.0');
    ok('التواصل', s?.contact?.phone === '0935770070' && /^09\d{8}$/.test(s?.contact?.whatsapp || ''));
    ok('لا أسرار فيه', !/apiKey|token|password|odoo/i.test(cfg.text));

    console.log('\n\x1b[1m2. الصلاحيات\x1b[0m');
    const admin = await register(PORT, 'المدير', ADMIN_PHONE);
    const customer = await register(PORT, 'عميل', uniq());
    const marketing = await register(PORT, 'التسويق', uniq());
    const support = await register(PORT, 'خدمة العملاء', uniq());
    ok('الحسابات تُسجَّل', [admin, customer, marketing, support].every((a) => a.status === 201 && a.token));
    await r('PATCH', `/api/panel/users/${marketing.id}/role`, { role: 'marketing' }, bearer(admin.token));
    await r('PATCH', `/api/panel/users/${support.id}/role`, { role: 'support' }, bearer(admin.token));

    ok('بلا رمز ← 401', (await r('GET', '/api/panel/settings')).status === 401);
    ok('العميل ← 403', (await r('GET', '/api/panel/settings', null, bearer(customer.token))).status === 403);
    ok('التسويق ← 403', (await r('GET', '/api/panel/settings', null, bearer(marketing.token))).status === 403);
    ok('خدمة العملاء ← 403', (await r('GET', '/api/panel/settings', null, bearer(support.token))).status === 403);
    const mkPut = await r('PUT', '/api/panel/settings', { maintenance: { on: true, message: 'من التسويق' } }, bearer(marketing.token));
    const spPut = await r('PUT', '/api/panel/settings', { forceUpdate: true }, bearer(support.token));
    ok('التسويق وخدمة العملاء لا يحفظان ← 403', mkPut.status === 403 && spPut.status === 403);

    const got = await r('GET', '/api/panel/settings', null, bearer(admin.token));
    ok('المدير يقرأ ← 200', got.status === 200, 'status ' + got.status);
    ok('المخزن: ملف الخادم بلا أودو', got.json?.storage === 'local');
    ok('مدن التوصيل: مجاني، والأيام', got.json?.delivery?.fee === 0 && /الجمعة/.test(got.json?.delivery?.days || ''));
    ok('لم يتغيّر شيء بمحاولاتهما', got.json?.settings?.maintenance?.on === false && got.json?.settings?.forceUpdate === false);

    console.log('\n\x1b[1m3. التحقق\x1b[0m');
    const bad = async (label, patch, field) => {
      const res = await r('PUT', '/api/panel/settings', patch, bearer(admin.token));
      ok(`${label} ← 400 (${field})`, res.status === 400 && res.json?.field === field, `${res.status} ${JSON.stringify(res.json)}`);
    };
    await bad('إصدار بلا x.y.z', { minVersion: { ios: '1.2' } }, 'minVersion.ios');
    await bad('إصدار بحروف', { minVersion: { android: 'v2.0.0' } }, 'minVersion.android');
    await bad('مفتاح ليس منطقياً', { forceUpdate: 'yes' }, 'forceUpdate');
    await bad('الزائر ليس منطقياً', { guestBrowsing: 1 }, 'guestBrowsing');
    await bad('صيانة بلا رسالة', { maintenance: { on: true, message: '  ' } }, 'maintenance.message');
    await bad('هاتف غير ليبي', { contact: { phone: '+44 20 7946 0958' } }, 'contact.phone');
    await bad('واتساب أرضي', { contact: { whatsapp: '0214445566' } }, 'contact.whatsapp');
    await bad('بريد غير صالح', { contact: { email: 'info@brimatex' } }, 'contact.email');
    await bad('صالة بلا عنوان', { contact: { showroom: ' ' } }, 'contact.showroom');
    await bad('وقت 25:00', { quietHours: { from: '25:00' } }, 'quietHours.from');
    await bad('وقت 8:00', { quietHours: { to: '8:00' } }, 'quietHours.to');
    await bad('البداية = النهاية', { quietHours: { from: '22:00', to: '22:00' } }, 'quietHours.to');

    const saved = await r(
      'PUT',
      '/api/panel/settings',
      { settings: { minVersion: { ios: '٢.١.٠', android: '2.01.3' }, contact: { phone: '+218 21 444 5566', whatsapp: '00218 91 234 5678', email: 'Care@Brimatex.ly' } } },
      bearer(admin.token)
    );
    ok('حفظ صالح ← 200', saved.status === 200, `${saved.status} ${JSON.stringify(saved.json)}`);
    const v = saved.json?.settings;
    ok('الإصدارات تُوحَّد', v?.minVersion?.ios === '2.1.0' && v?.minVersion?.android === '2.1.3', JSON.stringify(v?.minVersion));
    ok('الأرقام بصيغتها المحلية', v?.contact?.phone === '0214445566' && v?.contact?.whatsapp === '0912345678');
    ok('البريد بأحرف صغيرة', v?.contact?.email === 'care@brimatex.ly');
    ok('محفوظ في ملف الخادم', JSON.parse(fs.readFileSync(file, 'utf8')).appSettings?.minVersion?.ios === '2.1.0');

    console.log('\n\x1b[1m4. التخزين المؤقت وتجديده عند الحفظ\x1b[0m');
    // The file changes behind the server's back: the 5-minute copy stays.
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.appSettings.guestBrowsing = false;
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    ok('النسخة في الذاكرة باقية', (await r('GET', '/api/app/v1/config')).json?.settings?.guestBrowsing === true);
    const forced = await r('PUT', '/api/panel/settings', { forceUpdate: true }, bearer(admin.token));
    ok('الحفظ ← 200', forced.status === 200);
    const fresh = (await r('GET', '/api/app/v1/config')).json?.settings;
    ok('الحفظ يجدّد النسخة فوراً', fresh?.forceUpdate === true && fresh?.guestBrowsing === false && fresh?.minVersion?.ios === '2.1.0', JSON.stringify(fresh));

    console.log('\n\x1b[1m5. وضع الصيانة يوقف الطلبات في الخادم\x1b[0m');
    const products = await r('GET', '/api/products');
    const product = (products.json?.products || []).find((p) => p.enabled !== false);
    const order = (name) => ({
      customer: { name, phone: '0912345678', city: 'طرابلس', address: 'شارع الاختبار' },
      items: [{ productId: product.id, quantity: 1 }],
      channel: 'web',
    });
    const before = await r('POST', '/api/orders', order('قبل الصيانة'));
    ok('قبل الصيانة ← 201', before.status === 201, 'status ' + before.status);

    const message = 'نحدّث المتجر حتى الساعة 6 مساءً.';
    const on = await r('PUT', '/api/panel/settings', { maintenance: { on: true, message } }, bearer(admin.token));
    ok('تشغيل الصيانة ← 200', on.status === 200 && on.json?.settings?.maintenance?.on === true);
    const pub = (await r('GET', '/api/app/v1/config')).json?.settings?.maintenance;
    ok('الإعداد العام يحمل الرسالة', pub?.on === true && pub?.message === message, JSON.stringify(pub));
    const blocked = await r('POST', '/api/orders', order('أثناء الصيانة'));
    ok('طلب أثناء الصيانة ← 503 برسالتها', blocked.status === 503 && blocked.json?.error === message && blocked.json?.code === 'maintenance', `${blocked.status} ${JSON.stringify(blocked.json)}`);
    const appOrder = await r('POST', '/api/orders', { ...order('من التطبيق'), channel: 'app', requestId: 'req_maint_' + Date.now().toString(36) });
    ok('وطلب التطبيق كذلك', appOrder.status === 503);

    const off = await r('PUT', '/api/panel/settings', { maintenance: { on: false } }, bearer(admin.token));
    ok('إيقاف الصيانة ← 200، والرسالة محفوظة', off.status === 200 && off.json?.settings?.maintenance?.message === message);
    ok('بعد الصيانة ← 201', (await r('POST', '/api/orders', order('بعد الصيانة'))).status === 201);
  } catch (err) {
    fail++;
    failures.push('استثناء: ' + err.message);
    console.error(err);
    console.error(out.text);
  } finally {
    server.kill();
    fs.rmSync(file, { force: true });
  }
}

/** Just enough of Odoo's JSON-RPC: login, and ir.config_parameter get_param / set_param. */
function fakeOdoo() {
  const state = { param: false, getCalls: 0, setCalls: 0, deny: false };
  const server = http.createServer((rq, rs) => {
    let raw = '';
    rq.on('data', (c) => (raw += c));
    rq.on('end', () => {
      const { id, params } = JSON.parse(raw || '{}');
      const reply = (body) => {
        rs.writeHead(200, { 'Content-Type': 'application/json' });
        rs.end(JSON.stringify({ jsonrpc: '2.0', id, ...body }));
      };
      const error = (name, message) => reply({ error: { code: 200, message: 'Odoo Server Error', data: { name, message } } });
      if (params?.service === 'common' && params.method === 'login') return reply({ result: 7 });
      if (params?.service === 'common') return reply({ result: { server_version: '18.0' } });
      const [, , , model, method, args] = params?.args || [];
      if (model === 'ir.config_parameter' && method === 'get_param' && args?.[0] === 'brimatex.app.settings') {
        state.getCalls++;
        return reply({ result: state.param });
      }
      if (model === 'ir.config_parameter' && method === 'set_param' && args?.[0] === 'brimatex.app.settings') {
        state.setCalls++;
        if (state.deny) return error('odoo.exceptions.AccessError', "You are not allowed to modify 'System Parameter' (ir.config_parameter) records.");
        state.param = args[1];
        return reply({ result: true });
      }
      return error('odoo.exceptions.UserError', `not in the fake: ${model}.${method}`);
    });
  });
  return new Promise((resolve) => server.listen(FAKE_ODOO_PORT, '127.0.0.1', () => resolve({ server, state })));
}

async function odooServer() {
  const ADMIN_PHONE = uniq();
  const file = tempFile('settings-odoo');
  const odoo = await fakeOdoo();
  const { server, out } = await startTestServer({
    port: ODOO_PORT,
    env: {
      ADMIN_PHONES: ADMIN_PHONE,
      BRIMATEX_SETTINGS_FILE: file,
      ODOO_URL: `http://127.0.0.1:${FAKE_ODOO_PORT}`,
      ODOO_DB: 'test',
      ODOO_USERNAME: 'bot@brimatex.ly',
      ODOO_API_KEY: 'test-key',
    },
  });
  const r = (...args) => req(ODOO_PORT, ...args);
  try {
    console.log('\n\x1b[1m6. مع أودو: المعامل brimatex.app.settings\x1b[0m');
    const admin = await register(ODOO_PORT, 'المدير', ADMIN_PHONE);
    const got = await r('GET', '/api/panel/settings', null, bearer(admin.token));
    ok('المخزن: أودو، والقيم الافتراضية', got.status === 200 && got.json?.storage === 'odoo' && got.json?.settings?.maintenance?.on === false, `${got.status} ${JSON.stringify(got.json)}`);

    const saved = await r('PUT', '/api/panel/settings', { maintenance: { on: true, message: 'صيانة من أودو' } }, bearer(admin.token));
    ok('الحفظ ← set_param', saved.status === 200 && odoo.state.setCalls === 1, `${saved.status} ${JSON.stringify(saved.json)}`);
    ok('المعامل JSON بالشكل المتفق عليه', JSON.parse(odoo.state.param || '{}').maintenance?.message === 'صيانة من أودو');

    const calls = odoo.state.getCalls;
    const a = await r('GET', '/api/app/v1/config');
    const b = await r('GET', '/api/app/v1/config');
    ok('الإعداد العام من الذاكرة: لا قراءة من أودو', odoo.state.getCalls === calls && a.json?.settings?.maintenance?.on === true && b.json?.settings?.maintenance?.on === true, `get_param ${calls} → ${odoo.state.getCalls}`);

    odoo.state.deny = true;
    const before = odoo.state.param;
    const denied = await r('PUT', '/api/panel/settings', { maintenance: { on: false } }, bearer(admin.token));
    ok('أودو يرفض ← 503 برسالة الصلاحية', denied.status === 503 && denied.json?.error === 'تعذّر الحفظ في أودو: حساب الربط يحتاج صلاحية الإعدادات', `${denied.status} ${JSON.stringify(denied.json)}`);
    ok('القيمة القديمة باقية في أودو', odoo.state.param === before);
    ok('وفي الإعداد العام', (await r('GET', '/api/app/v1/config')).json?.settings?.maintenance?.on === true);
    ok('ولا شيء في ملف الخادم', !JSON.parse(fs.readFileSync(file, 'utf8')).appSettings);
  } catch (err) {
    fail++;
    failures.push('استثناء: ' + err.message);
    console.error(err);
    console.error(out.text);
  } finally {
    server.kill();
    odoo.server.close();
    fs.rmSync(file, { force: true });
  }
}

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — الإعدادات والإعداد العام ═══\x1b[0m');
  unit();
  await localServer();
  await odooServer();

  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
  if (fail) {
    console.log('\x1b[31m' + failures.map((f) => '  - ' + f).join('\n') + '\x1b[0m');
    process.exit(1);
  }
  process.exit(0);
}

run();
