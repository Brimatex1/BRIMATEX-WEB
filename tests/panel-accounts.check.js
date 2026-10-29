#!/usr/bin/env node
// The panel's المستخدمون - src/routes/panel.js /api/panel/accounts.
//
// What it guards: an admin sees every account and which app it uses, edits a
// name or a phone number, stops an account (signed out at once, no way back
// in until reopened) or erases it. Nobody else may, and an admin never acts on
// their own account or one granted by ADMIN_PHONES.
//
// Hermetic environment: no Postgres, no Odoo - the file store.
//
// Runs with the rest: npm test

'use strict';

const http = require('http');
const { startTestServer } = require('./_server');

const PORT = process.env.TEST_PORT || 3231;
const uniq = () => '09' + Math.floor(10000000 + Math.random() * 89999999);
const ADMIN_PHONE = uniq();

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
const PASSWORD = 'secret123';

async function register(name, phone) {
  const r = await req('POST', '/api/auth/register', { name, phone, password: PASSWORD });
  return { token: r.json?.token, id: r.json?.user?.id, phone, status: r.status };
}

const login = (phone) => req('POST', '/api/auth/login', { phone, password: PASSWORD });

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — المستخدمون في لوحة الإدارة ═══\x1b[0m');

  const { server, out } = await startTestServer({ port: PORT, env: { ADMIN_PHONES: ADMIN_PHONE } });

  try {
    const admin = await register('المدير', ADMIN_PHONE);
    const android = await register('عميل أندرويد', uniq());
    const iphone = await register('عميل آيفون', uniq());
    const support = await register('خدمة العملاء', uniq());
    ok('الحسابات تُسجَّل', [admin, android, iphone, support].every((a) => a.status === 201 && a.token));
    await req('PATCH', `/api/panel/users/${support.id}/role`, { role: 'support' }, bearer(admin.token));

    console.log('\n\x1b[1m1. البوابة\x1b[0m');
    ok('بلا رمز ← 401', (await req('GET', '/api/panel/accounts')).status === 401);
    ok('العميل ← 403', (await req('GET', '/api/panel/accounts', null, bearer(android.token))).status === 403);
    ok('خدمة العملاء ← 403', (await req('GET', '/api/panel/accounts', null, bearer(support.token))).status === 403);
    const me = await req('GET', '/api/panel/me', null, bearer(support.token));
    ok('خدمة العملاء بلا المستخدمون في الشريط', !me.json?.sections?.includes('users'));
    ok('خدمة العملاء لا توقف حساباً ← 403', (await req('POST', `/api/panel/accounts/${android.id}/suspend`, { suspended: true }, bearer(support.token))).status === 403);
    ok('العميل لا يحذف حساباً ← 403', (await req('DELETE', `/api/panel/accounts/${iphone.id}`, null, bearer(android.token))).status === 403);

    console.log('\n\x1b[1m2. القائمة ونوع الجهاز\x1b[0m');
    // The app reports its platform with the tracking answer, at every launch.
    ok('التطبيق يرسل أندرويد', (await req('POST', '/api/user/tracking', { status: 'denied', platform: 'android' }, bearer(android.token))).status === 200);
    ok('التطبيق يرسل آيفون', (await req('POST', '/api/user/tracking', { status: 'authorized', platform: 'ios' }, bearer(iphone.token))).status === 200);
    await req('POST', '/api/user/tracking', { status: 'denied', platform: 'windows' }, bearer(support.token));

    const all = await req('GET', '/api/panel/accounts', null, bearer(admin.token));
    ok('200', all.status === 200, 'status ' + all.status);
    const row = (list, id) => (list.json?.accounts || []).find((a) => a.id === id);
    ok('أندرويد', JSON.stringify(row(all, android.id)?.platforms) === '["android"]', JSON.stringify(row(all, android.id)));
    ok('آيفون', JSON.stringify(row(all, iphone.id)?.platforms) === '["ios"]');
    ok('منصة مجهولة لا تُحفظ', JSON.stringify(row(all, support.id)?.platforms) === '[]');
    ok('آخر فتح للتطبيق', Boolean(row(all, android.id)?.appSeenAt));
    ok('العدّادات', all.json?.counts?.android >= 1 && all.json?.counts?.ios >= 1 && all.json?.counts?.all >= 4, JSON.stringify(all.json?.counts));
    ok('لا كلمة مرور في القائمة', !all.text.includes('passwordHash') && !all.text.includes('password_hash'));

    const onlyAndroid = await req('GET', '/api/panel/accounts?platform=android', null, bearer(admin.token));
    ok('مرشّح أندرويد', row(onlyAndroid, android.id) && !row(onlyAndroid, iphone.id));
    const byPhone = await req('GET', `/api/panel/accounts?q=${iphone.phone.slice(3)}`, null, bearer(admin.token));
    ok('البحث بجزء من الرقم', byPhone.json?.accounts?.length === 1 && row(byPhone, iphone.id));
    const byName = await req('GET', `/api/panel/accounts?q=عميل آيفون`, null, bearer(admin.token));
    ok('البحث بالاسم', Boolean(row(byName, iphone.id)));

    const profile = await req('GET', `/api/panel/customers/u:${android.id}`, null, bearer(admin.token));
    ok('صفحة العميل تعرف جهازه', profile.json?.customer?.account?.appPlatform === 'android', JSON.stringify(profile.json?.customer?.account));

    console.log('\n\x1b[1m3. تعديل البيانات\x1b[0m');
    const renamed = await req('PATCH', `/api/panel/accounts/${android.id}`, { name: 'اسم جديد' }, bearer(admin.token));
    ok('تعديل الاسم ← 200', renamed.status === 200 && renamed.json?.account?.name === 'اسم جديد');
    ok('اسم قصير ← 400', (await req('PATCH', `/api/panel/accounts/${android.id}`, { name: 'ا' }, bearer(admin.token))).status === 400);
    ok('رقم غير صالح ← 400', (await req('PATCH', `/api/panel/accounts/${android.id}`, { phone: '12' }, bearer(admin.token))).status === 400);
    ok('رقم حساب آخر ← 409', (await req('PATCH', `/api/panel/accounts/${android.id}`, { phone: iphone.phone }, bearer(admin.token))).status === 409);
    ok('حسابه هو ← 409', (await req('PATCH', `/api/panel/accounts/${admin.id}`, { name: 'أنا' }, bearer(admin.token))).status === 409);
    ok('حساب غير موجود ← 404', (await req('PATCH', '/api/panel/accounts/nobody', { name: 'أحد' }, bearer(admin.token))).status === 404);
    const newPhone = uniq();
    const moved = await req('PATCH', `/api/panel/accounts/${android.id}`, { phone: newPhone }, bearer(admin.token));
    ok('تغيير الرقم ← 200', moved.status === 200 && moved.json?.account?.phone === newPhone, 'status ' + moved.status);
    ok('الدخول بالرقم الجديد', (await login(newPhone)).status === 200);
    ok('والقديم لا يدخل', (await login(android.phone)).status === 401);
    android.phone = newPhone;

    console.log('\n\x1b[1m4. إيقاف الحساب\x1b[0m');
    ok('الجلسة تعمل قبل الإيقاف', (await req('GET', '/api/auth/me', null, bearer(android.token))).status === 200);
    const stop = await req('POST', `/api/panel/accounts/${android.id}/suspend`, { suspended: true }, bearer(admin.token));
    ok('إيقاف ← 200', stop.status === 200 && Boolean(stop.json?.suspendedAt));
    ok('الجلسة تسقط فوراً ← 401', (await req('GET', '/api/auth/me', null, bearer(android.token))).status === 401);
    const refused = await login(android.phone);
    ok('الدخول ← 403 موقوف', refused.status === 403 && refused.json?.code === 'suspended', 'status ' + refused.status);
    const suspended = await req('GET', '/api/panel/accounts?status=suspended', null, bearer(admin.token));
    ok('مرشّح الموقوفين', Boolean(row(suspended, android.id)) && !row(suspended, iphone.id));
    ok('لا يوقف نفسه ← 409', (await req('POST', `/api/panel/accounts/${admin.id}/suspend`, { suspended: true }, bearer(admin.token))).status === 409);
    const reopen = await req('POST', `/api/panel/accounts/${android.id}/suspend`, { suspended: false }, bearer(admin.token));
    ok('إعادة التفعيل ← 200', reopen.status === 200 && reopen.json?.suspendedAt === null);
    const back = await login(android.phone);
    ok('يدخل بعدها', back.status === 200 && Boolean(back.json?.token));

    console.log('\n\x1b[1m5. حذف الحساب\x1b[0m');
    ok('حساب من الفريق ← 409', (await req('DELETE', `/api/panel/accounts/${support.id}`, null, bearer(admin.token))).status === 409);
    ok('حسابه هو ← 409', (await req('DELETE', `/api/panel/accounts/${admin.id}`, null, bearer(admin.token))).status === 409);
    const gone = await req('DELETE', `/api/panel/accounts/${iphone.id}`, null, bearer(admin.token));
    ok('حذف ← 200', gone.status === 200 && gone.json?.deleted === true, 'status ' + gone.status);
    ok('جلسته تسقط ← 401', (await req('GET', '/api/auth/me', null, bearer(iphone.token))).status === 401);
    ok('لا يدخل بعدها', (await login(iphone.phone)).status === 401);
    ok('مرة ثانية ← 404', (await req('DELETE', `/api/panel/accounts/${iphone.id}`, null, bearer(admin.token))).status === 404);
    const after = await req('GET', '/api/panel/accounts', null, bearer(admin.token));
    ok('خرج من القائمة', !row(after, iphone.id));
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
