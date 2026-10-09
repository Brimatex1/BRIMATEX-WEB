#!/usr/bin/env node
// Fake accounts and fake orders - the server as it runs live (the suite's
// shortcut BRIMATEX_ALLOW_UNVERIFIED off):
//  - a new account proves its number with a WhatsApp code, once; then it
//    signs in with its password. An account without a code is refused.
//  - forgot the password: a code to the number, then a new password.
//  - wrong passwords: five for one number lock it for 15 minutes.
//  - an order needs an account: one sent straight to the server is refused.
//
// Runs with the rest: npm test

'use strict';

const http = require('http');
const { startTestServer } = require('./_server');

let out = { text: '' };
const PORT = process.env.TEST_PORT || 3207;
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
        headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers },
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const newPhone = () => '09' + Math.floor(10000000 + Math.random() * 89999999);
const intlOf = (phone) => '218' + phone.slice(1);
function codeFor(intl) {
  const hits = [...out.text.matchAll(/OTP demo\] (\d+) -> (\d{6})/g)].filter((m) => m[1] === intl);
  return hits.length ? hits[hits.length - 1][2] : null;
}

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ الحسابات والطلبات الوهمية ═══\x1b[0m');
  // As live: no shortcuts.
  const started = await startTestServer({ port: PORT, env: { BRIMATEX_ALLOW_UNVERIFIED: '' } });
  const server = started.server;
  out = started.out;

  try {
    const phone = newPhone();
    const password = 'secret-' + Math.random().toString(36).slice(2, 8);

    console.log('\n\x1b[1m1. حساب جديد: رمز واتساب مرة واحدة، ثم كلمة مرور\x1b[0m');
    const unverified = await req('POST', '/api/auth/register', { name: 'وهمي', phone: newPhone(), password: 'secret123' });
    ok('حساب بلا رمز: مرفوض (400)', unverified.status === 400 && unverified.json?.code === 'verify_required', JSON.stringify(unverified.json));
    ok('طلب الرمز (200)', (await req('POST', '/api/auth/signup/otp/request', { phone })).status === 200);
    await wait(400);
    const code = codeFor(intlOf(phone));
    const verified = await req('POST', '/api/auth/signup/otp/verify', { phone, code });
    ok('الرمز الصحيح يعطي توثيقاً', verified.status === 200 && Boolean(verified.json?.signupToken), JSON.stringify(verified.json));
    const created = await req('POST', '/api/auth/register', { name: 'زبون حقيقي', password, signupToken: verified.json?.signupToken });
    ok('الحساب بالاسم وكلمة المرور (201)', created.status === 201 && Boolean(created.json?.token) && created.json?.user?.phone === phone, JSON.stringify(created.json));
    const reused = await req('POST', '/api/auth/register', { name: 'ثانٍ', password, signupToken: verified.json?.signupToken });
    ok('التوثيق لمرة واحدة', reused.status === 400);
    const again = await req('POST', '/api/auth/signup/otp/request', { phone });
    ok('حساب جديد برقم مسجّل: «مسجّل من قبل» (409) بلا رمز', again.status === 409 && again.json?.code === 'registered' && /مسجّل من قبل/.test(again.json?.error || ''), JSON.stringify(again.json));

    console.log('\n\x1b[1m2. الدخول بالرقم وكلمة المرور\x1b[0m');
    const signedIn = await req('POST', '/api/auth/login', { phone, password });
    ok('كلمة المرور الصحيحة (200)', signedIn.status === 200 && Boolean(signedIn.json?.token));
    const wrong = await req('POST', '/api/auth/login', { phone, password: 'nope-123' });
    ok('خاطئة (401) مع «نسيت كلمة المرور»', wrong.status === 401 && /نسيت كلمة المرور/.test(wrong.json?.error || ''), JSON.stringify(wrong.json));

    console.log('\n\x1b[1m3. محاولات كثيرة تقفل الرقم\x1b[0m');
    for (let i = 0; i < 4; i++) await req('POST', '/api/auth/login', { phone, password: 'nope-' + i });
    const locked = await req('POST', '/api/auth/login', { phone, password });
    ok('بعد خمس خاطئة: حتى الصحيحة تنتظر (429)', locked.status === 429 && locked.json?.code === 'locked', JSON.stringify(locked.json));

    console.log('\n\x1b[1m4. نسيت كلمة المرور: رمز ثم كلمة جديدة\x1b[0m');
    ok('طلب الرمز (200)', (await req('POST', '/api/auth/otp/request', { phone })).status === 200);
    await wait(400);
    const resetCode = codeFor(intlOf(phone));
    const resetOk = await req('POST', '/api/auth/otp/verify', { phone, code: resetCode });
    ok('الرمز يعطي إذن التغيير', resetOk.status === 200 && Boolean(resetOk.json?.resetToken), JSON.stringify(resetOk.json));
    const newPassword = password + '-2';
    const changed = await req('POST', '/api/auth/password', { resetToken: resetOk.json?.resetToken, password: newPassword });
    ok('كلمة جديدة تُحفظ ويدخل (200)', changed.status === 200 && Boolean(changed.json?.token));

    console.log('\n\x1b[1m5. الطلب يحتاج حساباً\x1b[0m');
    const products = (await req('GET', '/api/products')).json?.products || [];
    const item = products.find((p) => p.enabled !== false);
    const order = { customer: { name: 'وهمي', phone: newPhone(), city: 'طرابلس', address: 'لا مكان' }, items: [{ productId: (item?.variants?.[0] ?? item)?.id, quantity: 1 }] };
    const anonymous = await req('POST', '/api/orders', order);
    ok('طلب بلا حساب: مرفوض (401)', anonymous.status === 401 && anonymous.json?.code === 'login_required', JSON.stringify(anonymous.json));
    const withAccount = await req('POST', '/api/orders', { ...order, customer: { ...order.customer, phone } }, { Authorization: `Bearer ${changed.json?.token}` });
    ok('من حساب: يُقبل (201)', withAccount.status === 201, `status ${withAccount.status} ${JSON.stringify(withAccount.json)?.slice(0, 160)}`);
  } finally {
    server.kill();
  }

  console.log(`\n\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
  if (fail) {
    console.log('\x1b[31mالفحوص الفاشلة:\x1b[0m\n' + failures.map((f) => '  • ' + f).join('\n'));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
