#!/usr/bin/env node
/**
 * BRIMATEX — Smoke test suite (zero dependencies).
 * Verifies: DOM wiring (HTML <-> app.js), static assets, and every API flow.
 *
 * Run:  node tests/smoke.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'src', 'public');
const PORT = process.env.TEST_PORT || 3199;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`); }
}

function group(title) { console.log(`\n\x1b[1m${title}\x1b[0m`); }

function request(method, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path: urlPath, method,
        headers: Object.assign({}, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, headers || {}) },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(raw); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body: raw, json });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/* ---------------- 1. build output ---------------- */
// True only once `npm run build` has replaced src/public with the Vite bundle.
// The pre-migration static page also has an index.html, so check for the
// fingerprinted asset reference Vite emits rather than the file alone.
const SHELL = path.join(PUBLIC, 'index.html');
const BUILT =
  fs.existsSync(SHELL) && /src="\/assets\/[^"]+\.js"/.test(fs.readFileSync(SHELL, 'utf8'));

function testBuildOutput() {
  group('1. ناتج البناء');

  if (!BUILT) {
    console.log('  \x1b[33m⚠\x1b[0m  لم تُبنَ واجهة React بعد — شغّل: npm run setup && npm run build');
    console.log('     (الصفحة الحالية تعمل، وفحص كود الواجهة متاح عبر: node tests/frontend.check.js)');
    return;
  }

  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

  check('صفحة الجذر تحتوي عنصر #root', /id="root"/.test(html));
  check('الحزمة مرتبطة كوحدة خارجية', /<script[^>]*type="module"[^>]*src="\/assets\//.test(html));
  check('ملف الأنماط مرتبط', /<link[^>]*rel="stylesheet"[^>]*href="\/assets\//.test(html));

  // CSP is `script-src 'self'` — any inline script body would be blocked.
  const inline = html.match(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/);
  check('لا يوجد سكربت مضمّن (تمنعه CSP)', !inline || !inline[1].trim());

  check('lang و dir مضبوطان للعربية', /<html lang="ar" dir="rtl">/.test(html));
  check('viewport meta موجود', /name="viewport"/.test(html));

  const assetsDir = path.join(PUBLIC, 'assets');
  const assets = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
  check('مجلد الأصول مُولَّد', assets.length > 0, `count ${assets.length}`);
  check('أسماء الأصول تحمل بصمة للتخزين المؤقت', assets.every((f) => /-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(f) || !/\.(js|css)$/.test(f)), assets.join(', '));

  // Every asset the shell references must actually exist on disk.
  const referenced = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map((m) => m[1]);
  const dangling = referenced.filter((f) => !assets.includes(f));
  check('كل أصل مشار إليه موجود فعلاً', dangling.length === 0, dangling.join(', '));
}

/* ---------------- 2. Static assets ---------------- */
async function testStatic() {
  group('2. خدمة الملفات');

  const root = await request('GET', '/');
  check('/ يُخدَم بنجاح (200)', root.status === 200, `status ${root.status}`);
  check('/ بنوع محتوى HTML', (root.headers['content-type'] || '').includes('text/html'), root.headers['content-type']);

  const csp = root.headers['content-security-policy'] || '';
  check('CSP تسمح بخطوط Google', csp.includes('fonts.googleapis.com'));
  check('CSP تمنع السكربتات الخارجية', csp.includes("script-src 'self'"));
  check('رأس nosniff موجود', root.headers['x-content-type-options'] === 'nosniff');
  check('صفحة الجذر لا تُخزَّن مؤقتاً', (root.headers['cache-control'] || '').includes('no-cache'), root.headers['cache-control']);

  if (!BUILT) return;

  // Serve each hashed asset the shell references, with long-lived caching.
  const referenced = [...root.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  check('صفحة الجذر تشير إلى أصول', referenced.length > 0, `count ${referenced.length}`);

  for (const asset of referenced.slice(0, 4)) {
    const r = await request('GET', asset);
    const expected = asset.endsWith('.css') ? 'text/css' : 'text/javascript';
    check(`${asset} يُخدَم بنجاح (200)`, r.status === 200, `status ${r.status}`);
    check(`${asset} بنوع محتوى صحيح`, (r.headers['content-type'] || '').includes(expected), r.headers['content-type']);
    check(`${asset} يُخزَّن مؤقتاً بأمان`, (r.headers['cache-control'] || '').includes('immutable'), r.headers['cache-control']);
  }

  // Unknown client-side routes must fall back to the SPA shell, not 404.
  const deep = await request('GET', '/some/deep/route');
  check('المسارات غير المعروفة ترجع صفحة التطبيق', deep.status === 200 && deep.body.includes('id="root"'), `status ${deep.status}`);
}

/* ---------------- 3. Products API ---------------- */
let products = [];
async function testProducts() {
  group('3. واجهة المنتجات');
  const r = await request('GET', '/api/products');
  check('GET /api/products يرجع 200', r.status === 200, `status ${r.status}`);
  check('الاستجابة تحتوي مصفوفة منتجات', Array.isArray(r.json?.products));
  products = r.json?.products || [];
  check('يوجد منتج واحد على الأقل', products.length > 0, `count ${products.length}`);
  check('كل منتج له id رقمي صحيح', products.every((p) => Number.isInteger(p.id)));
  check('كل منتج له اسم', products.every((p) => typeof p.name === 'string' && p.name.trim()));
  check('كل منتج له سعر موجب', products.every((p) => Number(p.price) > 0));
  check('المعرّفات فريدة', new Set(products.map((p) => p.id)).size === products.length);

  const h = await request('GET', '/api/health');
  check('GET /api/health يرجع ok', h.status === 200 && h.json?.ok === true);
}

/* ---------------- 4. Order flow ---------------- */
async function testOrders() {
  group('4. تدفّق الطلبات');
  const p1 = products[0], p2 = products[1] || products[0];

  const valid = {
    customer: { name: 'عميل اختبار', phone: '0501234567', city: 'الرياض', address: 'حي النخيل، شارع 5' },
    items: [{ productId: p1.id, quantity: 2 }],
    note: 'اختبار آلي',
  };

  // Malformed JSON first — the rate limiter runs before parsing, so this
  // must be checked while we're still under the per-minute quota.
  const badJson = await new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/orders', method: 'POST',
      headers: { 'Content-Type': 'application/json' } }, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c)); res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.write('{not json'); req.end();
  });
  check('يُرفض: JSON تالف (400)', badJson.status === 400, `status ${badJson.status}`);

  const ok = await request('POST', '/api/orders', valid);
  check('طلب صحيح يُقبل (201)', ok.status === 201, `status ${ok.status} — ${ok.body.slice(0, 80)}`);
  check('الاستجابة تحوي رقم الطلب', !!ok.json?.orderName);
  check('الاستجابة تحوي رقم الفاتورة', !!ok.json?.invoiceName);

  const expected = Number(p1.price) * 2;
  check(`الإجمالي محسوب بسعر المنتج الحقيقي (${expected})`, ok.json?.total === expected, `got ${ok.json?.total}`);

  // Multi-item total
  const multi = await request('POST', '/api/orders', {
    customer: valid.customer,
    items: [{ productId: p1.id, quantity: 1 }, { productId: p2.id, quantity: 3 }],
  });
  const expectedMulti = Number(p1.price) * 1 + Number(p2.price) * 3;
  check('الإجمالي صحيح لعدة منتجات مختلفة', multi.json?.total === expectedMulti, `expected ${expectedMulti}, got ${multi.json?.total}`);

  // Validation
  const cases = [
    ['الاسم مفقود', { ...valid, customer: { ...valid.customer, name: '' } }],
    ['الجوال مفقود', { ...valid, customer: { ...valid.customer, phone: '' } }],
    ['المدينة مفقودة', { ...valid, customer: { ...valid.customer, city: '' } }],
    ['العنوان مفقود', { ...valid, customer: { ...valid.customer, address: '' } }],
    ['السلة فارغة', { ...valid, items: [] }],
    ['منتج غير موجود', { ...valid, items: [{ productId: 999999, quantity: 1 }] }],
    ['كمية صفرية', { ...valid, items: [{ productId: p1.id, quantity: 0 }] }],
    ['كمية سالبة', { ...valid, items: [{ productId: p1.id, quantity: -5 }] }],
  ];
  for (const [label, payload] of cases) {
    const r = await request('POST', '/api/orders', payload);
    check(`يُرفض: ${label} (400)`, r.status === 400, `status ${r.status}`);
  }

  // Rate limiting: the test server runs with RATE_LIMIT_ORDERS_PER_MIN=50.
  // Burn through the remaining quota, then confirm the next order is throttled.
  let throttled = { status: 0 };
  for (let i = 0; i < 60; i++) {
    throttled = await request('POST', '/api/orders', valid);
    if (throttled.status === 429) break;
  }
  check('حد الطلبات يعمل بعد تجاوز الحصة (429)', throttled.status === 429, `status ${throttled.status}`);

  const apiClient = fs.readFileSync(path.join(ROOT, 'web', 'src', 'lib', 'api.ts'), 'utf8');
  check('الواجهة تتعامل مع خطأ 429', /429/.test(apiClient));
}

/* ---------------- 5. Auth flow ---------------- */
async function testAuth() {
  group('5. تدفّق الحساب');
  const phone = '05' + Math.floor(10000000 + Math.random() * 89999999);
  const password = 'test123456';

  const reg = await request('POST', '/api/auth/register', { name: 'مستخدم اختبار', phone, password });
  check('التسجيل ينجح (201)', reg.status === 201, `status ${reg.status}`);
  check('التسجيل يرجع رمز جلسة', !!reg.json?.token);

  const dup = await request('POST', '/api/auth/register', { name: 'مكرر', phone, password });
  check('رقم مسجّل مسبقاً يُرفض (409)', dup.status === 409, `status ${dup.status}`);

  const shortPw = await request('POST', '/api/auth/register', { name: 'ق', phone: '0509998887', password: '123' });
  check('كلمة مرور قصيرة تُرفض (400)', shortPw.status === 400, `status ${shortPw.status}`);

  const login = await request('POST', '/api/auth/login', { phone, password });
  check('الدخول ينجح (200)', login.status === 200, `status ${login.status}`);
  const token = login.json?.token;
  check('الدخول يرجع رمز جلسة', !!token);

  const wrong = await request('POST', '/api/auth/login', { phone, password: 'wrongpass' });
  check('كلمة مرور خاطئة تُرفض (401)', wrong.status === 401, `status ${wrong.status}`);

  const me = await request('GET', '/api/auth/me', null, { Authorization: `Bearer ${token}` });
  check('GET /api/auth/me برمز صحيح (200)', me.status === 200, `status ${me.status}`);
  check('البيانات تعود بالاسم الصحيح', me.json?.user?.name === 'مستخدم اختبار');
  check('البيانات لا تكشف كلمة المرور', !JSON.stringify(me.json).toLowerCase().includes('password'));

  const noAuth = await request('GET', '/api/auth/me');
  check('بدون رمز يُرفض (401)', noAuth.status === 401, `status ${noAuth.status}`);

  const badAuth = await request('GET', '/api/auth/me', null, { Authorization: 'Bearer invalid-token-xyz' });
  check('رمز غير صالح يُرفض (401)', badAuth.status === 401, `status ${badAuth.status}`);
}

/* ---------------- 6. Security ---------------- */
async function testSecurity() {
  group('6. الأمان');
  const trav = await request('GET', '/../../package.json');
  check('محاولة تجاوز المسار محجوبة', trav.status !== 200 || !trav.body.includes('"dependencies"'), `status ${trav.status}`);

  const notFound = await request('GET', '/api/does-not-exist');
  check('نقطة API غير موجودة ترجع 404', notFound.status === 404, `status ${notFound.status}`);

  // React escapes interpolated values by default; the risk is an explicit opt-out.
  const webSrc = path.join(ROOT, 'web', 'src');
  const sources = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) sources.push(fs.readFileSync(full, 'utf8'));
    }
  })(webSrc);
  const allWeb = sources.join('\n');
  check('لا يوجد تجاوز لتهريب React', !/dangerouslySetInnerHTML/.test(allWeb));
  check('لا يوجد innerHTML مباشر', !/\.innerHTML\s*=/.test(allWeb));
}

/* ---------------- runner ---------------- */
(async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — اختبار شامل ═══\x1b[0m');

  testBuildOutput();

  const server = spawn('node', [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT, ODOO_URL: '', TWILIO_ACCOUNT_SID: '', RATE_LIMIT_ORDERS_PER_MIN: '50' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((r) => setTimeout(r, 1500));

  try {
    await testStatic();
    await testProducts();
    await testOrders();
    await testAuth();
    await testSecurity();
  } catch (err) {
    fail++;
    failures.push('خطأ غير متوقع: ' + err.message);
    console.error('\x1b[31m' + err.stack + '\x1b[0m');
  } finally {
    server.kill();
  }

  const total = pass + fail;
  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${total}` + (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : ''));
  if (fail) {
    console.log('\n\x1b[31mالاختبارات الفاشلة:\x1b[0m');
    failures.forEach((f) => console.log('  • ' + f));
  } else {
    console.log('\x1b[32m\x1b[1m✓ الموقع يعمل 100%\x1b[0m');
  }
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
})();
