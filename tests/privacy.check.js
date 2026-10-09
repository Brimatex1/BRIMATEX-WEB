#!/usr/bin/env node
// Apple's privacy requirements, server side:
//  - the app's App Tracking Transparency answer is stored per account; only
//    known answers are accepted, and only with a session.
//  - «إبلاغ» on a review (guideline 1.2): unknown reviews answer 404.
//  - deleting an account needs a WhatsApp code for its own number.
//  - the App Review account exists from start-up, signs in with its password,
//    and comes back after it is deleted.
//
// Runs with the rest: npm test

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { startTestServer } = require('./_server');

/** The file store's order log - the test server has no database. */
const ORDERS_LOG = path.join(__dirname, '..', 'src', 'data', 'orders.local.jsonl');

const PORT = process.env.TEST_PORT || 3219;
const REVIEW_PHONE = '09' + Math.floor(10000000 + Math.random() * 89999999);
const REVIEW_PASSWORD = 'review-' + Math.random().toString(36).slice(2, 10);
const REVIEW_CODE = String(100000 + Math.floor(Math.random() * 899999));
let out = { text: '' };
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

function req(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function codeFor(phone) {
  const intl = '218' + phone.slice(1);
  const hits = [...out.text.matchAll(/OTP demo\] (\d+) -> (\d{6})/g)].filter((m) => m[1] === intl);
  return hits.length ? hits[hits.length - 1][2] : null;
}

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ خصوصية أبل ═══\x1b[0m');
  const started = await startTestServer({
    port: PORT,
    env: { BRIMATEX_REVIEW_PHONE: REVIEW_PHONE, BRIMATEX_REVIEW_PASSWORD: REVIEW_PASSWORD, BRIMATEX_REVIEW_CODE: REVIEW_CODE },
  });
  const server = started.server;
  out = started.out;

  try {
    console.log('\n\x1b[1m1. حساب مراجع أبل\x1b[0m');
    const login = await req('POST', '/api/auth/login', { phone: REVIEW_PHONE, password: REVIEW_PASSWORD });
    ok('موجود من الإقلاع ويدخل بكلمة المرور', login.status === 200 && Boolean(login.json?.token), JSON.stringify(login.json));
    const token = login.json?.token;

    console.log('\n\x1b[1m2. إجابة التتبّع (ATT)\x1b[0m');
    ok('بلا جلسة: 401', (await req('POST', '/api/user/tracking', { status: 'authorized' })).status === 401);
    ok('حالة غير معروفة: 400', (await req('POST', '/api/user/tracking', { status: 'maybe' }, token)).status === 400);
    const saved = await req('POST', '/api/user/tracking', { status: 'denied', platform: 'ios' }, token);
    ok('«denied» تُحفظ (200)', saved.status === 200 && saved.json?.status === 'denied', JSON.stringify(saved.json));
    const me = await req('GET', '/api/auth/me', null, token);
    ok('الحساب يحمل آخر إجابة', me.json?.user?.trackingStatus === 'denied', JSON.stringify(me.json?.user));

    console.log('\n\x1b[1m3. الإبلاغ عن تقييم (1.2)\x1b[0m');
    const unknown = await req('POST', '/api/reviews/00000000-0000-4000-8000-000000000000/report');
    ok('تقييم غير موجود: 404', unknown.status === 404, JSON.stringify(unknown.json));
    ok('معرّف غير صالح لا يصل للمسار (404)', (await req('POST', '/api/reviews/../report')).status === 404);

    console.log('\n\x1b[1m4. حذف الحساب يحتاج رمز واتساب، والمراجع يعود\x1b[0m');
    const bare = await req('DELETE', '/api/auth/me', null, token);
    ok('بلا رمز: 400 verify_required', bare.status === 400 && bare.json?.code === 'verify_required', JSON.stringify(bare.json));
    ok('طلب الرمز (200)', (await req('POST', '/api/auth/otp/request', { phone: REVIEW_PHONE })).status === 200);
    await wait(400);
    ok('رقم المراجع لا يُرسل له واتساب', codeFor(REVIEW_PHONE) === null);
    const proof = await req('POST', '/api/auth/otp/verify', { phone: REVIEW_PHONE, code: REVIEW_CODE });
    ok('رمزه الثابت من .env يعطي إثباتاً', proof.status === 200 && Boolean(proof.json?.resetToken), JSON.stringify(proof.json));
    const gone = await req('DELETE', '/api/auth/me', { resetToken: proof.json?.resetToken }, token);
    ok('الحذف بالإثبات (200)', gone.status === 200, JSON.stringify(gone.json));
    ok('الجلسة القديمة انتهت', (await req('GET', '/api/auth/me', null, token)).status === 401);
    const back = await req('POST', '/api/auth/login', { phone: REVIEW_PHONE, password: REVIEW_PASSWORD });
    ok('حساب المراجع عاد فوراً', back.status === 200 && Boolean(back.json?.token), JSON.stringify(back.json));
    const fresh = await req('GET', '/api/auth/me', null, back.json?.token);
    ok('وعاد فارغاً (بلا إجابة تتبّع قديمة)', fresh.status === 200 && !fresh.json?.user?.trackingStatus, JSON.stringify(fresh.json?.user));

    console.log('\n\x1b[1m5. بعد الحذف: طلباته في الموقع بلا اسمه ولا رقمه ولا عنوانه\x1b[0m');
    const phone = '09' + Math.floor(10000000 + Math.random() * 89999999);
    const reg = await req('POST', '/api/auth/register', { name: 'زبون يغادر', phone, password: 'secret123' });
    const products = (await req('GET', '/api/products')).json?.products || [];
    const item = products.find((p) => p.enabled !== false);
    const placed = await req(
      'POST',
      '/api/orders',
      { customer: { name: 'زبون يغادر', phone, city: 'مصراتة', address: 'شارع الاختبار 7' }, items: [{ productId: (item?.variants?.[0] ?? item)?.id, quantity: 1 }] },
      reg.json?.token
    );
    ok('طلب من الحساب (201)', placed.status === 201, JSON.stringify(placed.json)?.slice(0, 160));
    await req('POST', '/api/auth/otp/request', { phone });
    await wait(400);
    const leaveProof = await req('POST', '/api/auth/otp/verify', { phone, code: codeFor(phone) });
    const left = await req('DELETE', '/api/auth/me', { resetToken: leaveProof.json?.resetToken }, reg.json?.token);
    ok('حذف الحساب (200)', left.status === 200, JSON.stringify(left.json));
    const kept = fs
      .readFileSync(ORDERS_LOG, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .find((o) => o.orderName === placed.json?.orderName);
    ok('الطلب باقٍ برقمه ومبلغه', Boolean(kept) && kept.total > 0, JSON.stringify(kept)?.slice(0, 160));
    ok('بلا اسم ولا رقم ولا عنوان - المدينة فقط', JSON.stringify(kept?.customer) === JSON.stringify({ city: 'مصراتة' }) && !kept?.userId, JSON.stringify(kept?.customer));
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
