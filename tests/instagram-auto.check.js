#!/usr/bin/env node
// The home's Instagram posts from the account itself - src/lib/instagramAuto.js.
//
// What it guards: only an admin connects the account; the token never comes
// back in any answer; pictures are copied here and only from allowed addresses;
// a failure keeps the last good posts; and without a connection the posts set
// by hand still show.
//
// Hermetic environment: a local stand-in for Instagram's API.
//
// Runs with the rest: npm test

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { startTestServer } = require('./_server');

const PORT = process.env.TEST_PORT || 3232;
const FAKE_PORT = Number(PORT) + 1;
const FAKE = `http://127.0.0.1:${FAKE_PORT}`;
const uniq = () => '09' + Math.floor(10000000 + Math.random() * 89999999);
const ADMIN_PHONE = uniq();
const TOKEN = 'IGTESTTOKEN' + 'x'.repeat(40) + 'ABCD';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);

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

/** A stand-in for graph.instagram.com, with a switch to fail. */
const fake = { down: false, media: [], imageHits: 0 };

function startFake() {
  const server = http.createServer((q, s) => {
    const url = new URL(q.url, FAKE);
    const send = (code, body) => {
      s.writeHead(code, { 'Content-Type': 'application/json' });
      s.end(JSON.stringify(body));
    };
    if (url.pathname.startsWith('/img/')) {
      fake.imageHits++;
      s.writeHead(200, { 'Content-Type': 'image/jpeg' });
      return s.end(url.pathname.includes('notimage') ? Buffer.from('<html>') : JPEG);
    }
    if (fake.down) return send(500, { error: { message: `boom ${url.searchParams.get('access_token')}` } });
    if (url.searchParams.get('access_token') !== TOKEN) return send(400, { error: { message: 'Invalid OAuth access token' } });
    if (url.pathname === '/me') return send(200, { id: '1', username: 'brimatex.ly', account_type: 'BUSINESS' });
    if (url.pathname === '/me/media') return send(200, { data: fake.media });
    return send(404, { error: { message: 'nope' } });
  });
  return new Promise((resolve) => server.listen(FAKE_PORT, '127.0.0.1', () => resolve(server)));
}

const media = (id, extra = {}) => ({
  id,
  media_type: 'IMAGE',
  media_url: `${FAKE}/img/${id}.jpg`,
  permalink: `https://www.instagram.com/p/${id}/`,
  timestamp: '2026-11-01T10:00:00+0000',
  ...extra,
});

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — منشورات إنستغرام التلقائية ═══\x1b[0m');
  const settingsFile = path.join(os.tmpdir(), `brimatex-ig-${Date.now()}.json`);
  fs.writeFileSync(settingsFile, '{}');
  const fakeServer = await startFake();
  const { server, out } = await startTestServer({
    port: PORT,
    env: { ADMIN_PHONES: ADMIN_PHONE, BRIMATEX_SETTINGS_FILE: settingsFile, BRIMATEX_INSTAGRAM_API: FAKE },
  });

  try {
    const admin = await register('المدير', ADMIN_PHONE);
    const marketing = await register('التسويق', uniq());
    await req('PATCH', `/api/panel/users/${marketing.id}/role`, { role: 'marketing' }, bearer(admin.token));

    console.log('\n\x1b[1m1. البوابة\x1b[0m');
    ok('بلا رمز ← 401', (await req('GET', '/api/panel/instagram-account')).status === 401);
    ok('التسويق ← 403', (await req('GET', '/api/panel/instagram-account', null, bearer(marketing.token))).status === 403);
    ok('التسويق لا يربط ← 403', (await req('PUT', '/api/panel/instagram-account', { token: TOKEN }, bearer(marketing.token))).status === 403);
    const before = await req('GET', '/api/panel/instagram-account', null, bearer(admin.token));
    ok('غير مربوط في البداية', before.status === 200 && before.json?.status?.connected === false);
    ok('لا منشورات', (await req('GET', '/api/instagram')).json?.posts?.length === 0);

    console.log('\n\x1b[1m2. الربط\x1b[0m');
    ok('مفتاح قصير ← 400', (await req('PUT', '/api/panel/instagram-account', { token: 'short' }, bearer(admin.token))).status === 400);
    const wrong = await req('PUT', '/api/panel/instagram-account', { token: 'WRONGTOKEN' + 'y'.repeat(40) }, bearer(admin.token));
    ok('مفتاح مرفوض ← 400', wrong.status === 400 && wrong.json?.error?.includes('Invalid'), wrong.text);
    ok('المفتاح المرفوض لا يُحفظ', (await req('GET', '/api/panel/instagram-account', null, bearer(admin.token))).json?.status?.connected === false);

    fake.media = [
      media('p1'),
      media('v2', { media_type: 'VIDEO', media_url: `${FAKE}/film.mp4`, thumbnail_url: `${FAKE}/img/v2.jpg` }),
      media('c3', { media_type: 'CAROUSEL_ALBUM' }),
      media('evil', { media_url: 'http://169.254.169.254/latest' }),
      media('bad', { media_url: `${FAKE}/img/notimage.jpg` }),
      media('nolink', { permalink: 'https://example.com/x' }),
      media('p4'),
      media('p5'),
      media('p6'),
      media('p7'),
    ];
    const connect = await req('PUT', '/api/panel/instagram-account', { token: TOKEN }, bearer(admin.token));
    ok('الربط ← 200', connect.status === 200 && connect.json?.status?.connected === true, connect.text);
    ok('اسم الحساب', connect.json?.status?.username === 'brimatex.ly');
    ok('آخر أربعة أحرف فقط', connect.json?.status?.tokenLast4 === 'ABCD');
    ok('المفتاح لا يعود في الرد', !connect.text.includes(TOKEN));

    console.log('\n\x1b[1m3. المنشورات\x1b[0m');
    const pub = await req('GET', '/api/instagram');
    const posts = pub.json?.posts || [];
    ok('خمسة منشورات', posts.length === 5, JSON.stringify(posts));
    ok('المفتاح لا يعود للعامة', !pub.text.includes(TOKEN) && !pub.text.includes('tokenSavedAt'));
    ok('الترتيب من الأحدث', posts.map((p) => p.link.split('/')[4]).join() === 'p1,v2,c3,p4,p5', JSON.stringify(posts.map((p) => p.link)));
    ok('الصور منسوخة عندنا', posts.every((p) => /^\/uploads\/instagram\/auto-[a-f0-9]{24}\.jpeg$/.test(p.imageUrl)), JSON.stringify(posts[0]));
    ok('الصورة تُقدَّم من موقعنا', (await req('GET', posts[0].imageUrl)).status === 200);
    ok('عنوان غير مسموح لا يُجلب، وصورة مزيفة لا تُقبل', !posts.some((p) => /evil|bad|nolink/.test(p.link)));

    const hits = fake.imageHits;
    await req('POST', '/api/panel/instagram-account/sync', null, bearer(admin.token));
    // The five kept pictures are not fetched again; only the fake one, never kept, is retried.
    ok('الصور المحفوظة لا تُجلب مرة ثانية', fake.imageHits === hits + 1, `${hits} → ${fake.imageHits}`);

    fake.media = [media('n9'), media('p1')];
    const synced = await req('POST', '/api/panel/instagram-account/sync', null, bearer(admin.token));
    ok('تحديث يجلب الجديد', synced.json?.status?.count === 2, synced.text);
    const after = (await req('GET', '/api/instagram')).json?.posts || [];
    ok('الجديد أولاً', after[0]?.link.includes('n9') && after.length === 2);
    const dropped = posts.find((p) => p.link.includes('p5'));
    ok('صورة منشور خرج تُحذف', (await req('GET', dropped.imageUrl)).text.includes('<div id="root">') || (await req('GET', dropped.imageUrl)).status === 404);

    console.log('\n\x1b[1m4. عند الفشل\x1b[0m');
    fake.down = true;
    const failed = await req('POST', '/api/panel/instagram-account/sync', null, bearer(admin.token));
    ok('الفشل يظهر في اللوحة', Boolean(failed.json?.status?.lastError?.message), failed.text);
    ok('رسالة الخطأ لا تحمل المفتاح', !failed.text.includes(TOKEN), failed.text);
    ok('المنشورات باقية', (await req('GET', '/api/instagram')).json?.posts?.length === 2);
    ok('المفتاح لا يظهر في سجل الخادم', !out.text.includes(TOKEN));
    fake.down = false;
    const healed = await req('POST', '/api/panel/instagram-account/sync', null, bearer(admin.token));
    ok('يرجع بعد الفشل', healed.json?.status?.lastError === null, healed.text);

    console.log('\n\x1b[1m5. إلغاء الربط\x1b[0m');
    const home = await req('GET', '/api/panel/home/instagram', null, bearer(marketing.token));
    ok('التسويق يرى أن الحساب مربوط', home.status === 200 && home.json?.connected === true);
    const off = await req('DELETE', '/api/panel/instagram-account', null, bearer(admin.token));
    ok('إلغاء الربط', off.json?.status?.connected === false);
    ok('الرئيسية تعود بلا منشورات', (await req('GET', '/api/instagram')).json?.posts?.length === 0);
    ok('المفتاح مُسح من الملف', !fs.readFileSync(settingsFile, 'utf8').includes(TOKEN));
  } catch (err) {
    fail++;
    failures.push('استثناء: ' + err.message);
    console.error(err);
    console.error(out.text);
  } finally {
    server.kill();
    fakeServer.close();
    try {
      fs.unlinkSync(settingsFile);
    } catch {
      /* gone */
    }
  }

  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
  if (fail) {
    console.log('\x1b[31m' + failures.map((f) => '  - ' + f).join('\n') + '\x1b[0m');
    process.exit(1);
  }
}

run();
