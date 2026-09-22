#!/usr/bin/env node
// Home banners - src/lib/banners.js, GET /api/banners and /api/admin/banners.
//
// - only an admin can add, relink, reorder or delete; anyone can read
// - a real image uploads and is served back; a text file dressed as one is refused
// - a link must stay inside the shop
// - the order sticks; the limit holds; deleting removes the file
//
// Runs with the rest: npm test

'use strict';

const http = require('http');
const { startTestServer } = require('./_server');

const fs = require('fs');
const path = require('path');

const PORT = process.env.TEST_PORT || 3185;
const ADMIN_PHONE = '09' + Math.floor(10000000 + Math.random() * 89999999);
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

function req(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: p,
        method,
        headers: {
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(raw.toString('utf8'));
          } catch {
            /* not JSON */
          }
          resolve({ status: res.statusCode, json, type: res.headers['content-type'], raw });
        });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// A real 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const dataUrl = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

(async () => {
  // The banners live in the settings file - snapshot it, restore it after.
  const settingsFile = path.join(__dirname, '..', 'src', 'data', 'settings.local.json');
  const before = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile) : null;
  if (before) {
    const data = JSON.parse(before.toString('utf8'));
    delete data.banners;
    fs.writeFileSync(settingsFile, JSON.stringify(data));
  }
  const { server } = await startTestServer({ port: PORT, env: { ADMIN_PHONES: ADMIN_PHONE } });
  try {
    const register = async (phone) =>
      (await req('POST', '/api/auth/register', { name: 'تجربة', phone, password: 'secret1' })).json.token;
    const admin = await register(ADMIN_PHONE);
    const customer = await register(uniq());

    ok('لا صور في البداية', JSON.stringify((await req('GET', '/api/banners')).json) === '{"banners":[]}');
    ok('زبون لا يضيف (403)', (await req('POST', '/api/admin/banners', { imageDataUrl: dataUrl(PNG) }, customer)).status === 403);
    ok('ضيف لا يضيف (401)', (await req('POST', '/api/admin/banners', { imageDataUrl: dataUrl(PNG) })).status === 401);

    const a = await req('POST', '/api/admin/banners', { imageDataUrl: dataUrl(PNG), link: '/shop?category=premium' }, admin);
    ok('المدير يضيف صورة برابط', a.status === 200 && a.json.banner?.link === '/shop?category=premium', JSON.stringify(a.json));
    const served = await req('GET', a.json.banner.imageUrl);
    ok('الصورة تُخدم', served.status === 200 && served.type === 'image/png' && served.raw.equals(PNG), `${served.status} ${served.type}`);

    const b = await req('POST', '/api/admin/banners', { imageDataUrl: dataUrl(PNG) }, admin);
    const c = await req('POST', '/api/admin/banners', { imageDataUrl: dataUrl(PNG), link: '/product/5852' }, admin);
    ok('ثلاث صور بالترتيب', (await req('GET', '/api/banners')).json.banners.map((x) => x.id).join() === [a, b, c].map((x) => x.json.banner.id).join());

    const fake = await req('POST', '/api/admin/banners', { imageDataUrl: dataUrl(Buffer.from('<script>alert(1)</script>')) }, admin);
    ok('نص متنكّر في صورة: مرفوض', fake.status === 400);
    const outside = await req('POST', '/api/admin/banners', { imageDataUrl: dataUrl(PNG), link: 'https://evil.example' }, admin);
    ok('رابط خارج المتجر: مرفوض', outside.status === 400);
    const sneaky = await req('PATCH', `/api/admin/banners/${b.json.banner.id}`, { link: '//evil.example' }, admin);
    ok('ولا //موقع-آخر', sneaky.status === 400);
    const relink = await req('PATCH', `/api/admin/banners/${b.json.banner.id}`, { link: '/quiz' }, admin);
    ok('تغيير الرابط', relink.status === 200 && relink.json.banner.link === '/quiz');

    const ids = [c, a, b].map((x) => x.json.banner.id);
    await req('PUT', '/api/admin/banners/order', { ids }, admin);
    ok('الترتيب الجديد يثبت', (await req('GET', '/api/banners')).json.banners.map((x) => x.id).join() === ids.join());

    await req('POST', '/api/admin/banners', { imageDataUrl: dataUrl(PNG) }, admin);
    await req('POST', '/api/admin/banners', { imageDataUrl: dataUrl(PNG) }, admin);
    ok('الحد الأقصى 5', (await req('POST', '/api/admin/banners', { imageDataUrl: dataUrl(PNG) }, admin)).status === 400);

    const del = await req('DELETE', `/api/admin/banners/${a.json.banner.id}`, null, admin);
    ok('الحذف', del.status === 200 && !del.json.banners.some((x) => x.id === a.json.banner.id));
    ok('وملفها حُذف', (await req('GET', a.json.banner.imageUrl)).type !== 'image/png');
    for (const x of (await req('GET', '/api/banners')).json.banners) await req('DELETE', `/api/admin/banners/${x.id}`, null, admin);
  } finally {
    server.kill();
    if (before) fs.writeFileSync(settingsFile, before);
    else fs.rmSync(settingsFile, { force: true });
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` + (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : ''));
  for (const f of failures) console.log('  • ' + f);
  console.log('────────────────────────────────────────────────────');
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
