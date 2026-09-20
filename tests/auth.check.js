#!/usr/bin/env node
// Account routes, end to end - src/routes/auth.js.
//
// What it guards: smoke.test.js covers register, login and me only, leaving
// six routes with no coverage at all - the signup and recovery codes, the
// password change, logout, and account deletion. Those are the likeliest to
// break in silence, because the client sees one constant message whatever
// happens - deliberately, so the endpoint cannot be used to learn which
// numbers are registered.
//
// The server is spawned hermetically: no Postgres, no Odoo, no WhatsApp token.
// So it runs on the file store, and the verification code is printed to the
// log instead of being sent - the whole flow completes at no cost and with no
// message to anyone's phone.
//
// Runs with the rest: npm test

const http = require('http');
const { startTestServer } = require('./_server');

/** Server output - codeFor reads it from outside run(), so it is declared here. */
let out = { text: '' };

const PORT = process.env.TEST_PORT || 3196;
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

/** The last code printed for this number in demo mode. */
function codeFor(intl) {
  const hits = [...out.text.matchAll(/OTP demo\] (\d+) -> (\d{6})/g)].filter((m) => m[1] === intl);
  return hits.length ? hits[hits.length - 1][2] : null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — مسارات الحساب ═══\x1b[0m');

  const started = await startTestServer({
    port: PORT,
  });
  const server = started.server;
  out = started.out;

  try {
    const phone = '09' + Math.floor(10000000 + Math.random() * 89999999);
    const intl = '218' + phone.slice(1);

    console.log('\n\x1b[1m1. توثيق الرقم عند التسجيل\x1b[0m');
    const r1 = await req('POST', '/api/auth/signup/otp/request', { phone });
    ok('طلب الرمز يُقبل (200)', r1.status === 200, `status ${r1.status}`);
    await wait(400);
    const code = codeFor(intl);
    ok('الرمز صدر فعلاً', Boolean(code), 'لا رمز في سجلّ الخادم');

    ok('رمز خاطئ يُرفض (400)', (await req('POST', '/api/auth/signup/otp/verify', { phone, code: '000000' })).status === 400);

    const v = await req('POST', '/api/auth/signup/otp/verify', { phone, code });
    ok('الرمز الصحيح يعيد signupToken', Boolean(v.json?.signupToken));

    const reg = await req('POST', '/api/auth/register', {
      name: 'فحص الحساب',
      password: 'secret123',
      signupToken: v.json?.signupToken,
    });
    ok('التسجيل بالرمز (201)', reg.status === 201, `status ${reg.status}`);
    ok('الرقم جاء من الرمز لا من الجسم', reg.json?.user?.phone === phone, String(reg.json?.user?.phone));
    ok('الرمز لمرة واحدة', (await req('POST', '/api/auth/register', {
      name: 'مكرّر', password: 'secret123', signupToken: v.json?.signupToken,
    })).status === 400);

    console.log('\n\x1b[1m2. استعادة الحساب\x1b[0m');
    ok('طلب رمز استعادة (200)', (await req('POST', '/api/auth/otp/request', { phone })).status === 200);
    await wait(400);
    const code2 = codeFor(intl);
    ok('رمز جديد يختلف عن الأول', Boolean(code2) && code2 !== code);

    const v2 = await req('POST', '/api/auth/otp/verify', { phone, code: code2 });
    ok('التحقّق يعيد resetToken', Boolean(v2.json?.resetToken));

    const pw = await req('POST', '/api/auth/password', {
      resetToken: v2.json?.resetToken,
      password: 'newsecret1',
    });
    ok('تغيير الكلمة يعيد جلسة (200)', pw.status === 200 && Boolean(pw.json?.token), `status ${pw.status}`);
    ok('الدخول بالكلمة الجديدة ينجح', (await req('POST', '/api/auth/login', { phone, password: 'newsecret1' })).status === 200);
    ok('الكلمة القديمة لم تعد تعمل', (await req('POST', '/api/auth/login', { phone, password: 'secret123' })).status !== 200);

    console.log('\n\x1b[1m3. الخروج وحذف الحساب\x1b[0m');
    const token = pw.json?.token;
    ok('logout (200)', (await req('POST', '/api/auth/logout', null, { Authorization: `Bearer ${token}` })).status === 200);
    ok('الرمز المُبطَل يردّ 401', (await req('GET', '/api/auth/me', null, { Authorization: `Bearer ${token}` })).status === 401);

    const again = await req('POST', '/api/auth/login', { phone, password: 'newsecret1' });
    ok('DELETE /api/auth/me (200)', (await req('DELETE', '/api/auth/me', null, { Authorization: `Bearer ${again.json?.token}` })).status === 200);
    ok('الدخول بعد الحذف يفشل', (await req('POST', '/api/auth/login', { phone, password: 'newsecret1' })).status !== 200);
  } catch (e) {
    fail++;
    failures.push('خطأ غير متوقع: ' + e.message);
    console.error('\x1b[31m' + e.stack + '\x1b[0m');
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
