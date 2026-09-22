#!/usr/bin/env node
// Profile photos - src/lib/avatar.js and POST/DELETE /api/user/avatar.
//
// - a real PNG uploads, is served back as an image, and shows on /api/auth/me
// - a second upload replaces the first, whose file is deleted
// - a text file dressed as a PNG data URL is refused (bytes, not the label)
// - an oversized image is refused; a guest is refused
// - removing the photo deletes its file; deleting the account does too
//
// Runs with the rest: npm test

'use strict';

const http = require('http');
const { startTestServer } = require('./_server');

const PORT = process.env.TEST_PORT || 3187;
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
const dataUrl = (buf, type = 'png') => `data:image/${type};base64,${buf.toString('base64')}`;

(async () => {
  const { server } = await startTestServer({ port: PORT });
  try {
    const reg = await req('POST', '/api/auth/register', { name: 'صاحب صورة', phone: uniq(), password: 'secret1' });
    const token = reg.json.token;

    ok('ضيف: 401', (await req('POST', '/api/user/avatar', { imageDataUrl: dataUrl(PNG) })).status === 401);

    const first = await req('POST', '/api/user/avatar', { imageDataUrl: dataUrl(PNG) }, token);
    ok('رفع صورة PNG حقيقية: 200', first.status === 200 && /^\/uploads\/avatars\/[a-f0-9]{32}\.png$/.test(first.json?.avatarUrl || ''), JSON.stringify(first.json));
    const served = await req('GET', first.json.avatarUrl);
    ok('الصورة تُخدم كصورة', served.status === 200 && served.type === 'image/png' && served.raw.equals(PNG), `${served.status} ${served.type}`);
    ok('تظهر في /api/auth/me', (await req('GET', '/api/auth/me', null, token)).json?.user?.avatarUrl === first.json.avatarUrl);

    const second = await req('POST', '/api/user/avatar', { imageDataUrl: dataUrl(PNG) }, token);
    ok('صورة جديدة باسم جديد', second.status === 200 && second.json.avatarUrl !== first.json.avatarUrl);
    ok('القديمة حُذفت من الخادم', (await req('GET', first.json.avatarUrl)).type !== 'image/png');

    const fake = await req('POST', '/api/user/avatar', { imageDataUrl: dataUrl(Buffer.from('<script>alert(1)</script>')) }, token);
    ok('نص متنكّر في صورة: مرفوض (400)', fake.status === 400, 'status ' + fake.status);
    ok('وما تغيّرت الصورة', (await req('GET', '/api/auth/me', null, token)).json?.user?.avatarUrl === second.json.avatarUrl);

    const big = Buffer.concat([PNG, Buffer.alloc(2_100_000)]);
    const tooBig = await req('POST', '/api/user/avatar', { imageDataUrl: dataUrl(big) }, token);
    ok('أكبر من 2 ميجا: مرفوض (413)', tooBig.status === 413, 'status ' + tooBig.status);

    const removed = await req('DELETE', '/api/user/avatar', null, token);
    ok('حذف الصورة: 200 وبلا صورة', removed.status === 200 && removed.json.avatarUrl === null);
    ok('ملفها حُذف', (await req('GET', second.json.avatarUrl)).type !== 'image/png');

    const again = await req('POST', '/api/user/avatar', { imageDataUrl: dataUrl(PNG) }, token);
    await req('DELETE', '/api/auth/me', null, token);
    ok('حذف الحساب يحذف صورته', (await req('GET', again.json.avatarUrl)).type !== 'image/png');
  } finally {
    server.kill();
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
