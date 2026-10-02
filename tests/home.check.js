#!/usr/bin/env node
// The panel's «الواجهة والبانرات» - src/lib/home.js, /api/panel/home and the
// `home` key of /api/app/v1/config.
//
// What it guards:
//   - admin and marketing read and save the home; support and customers cannot;
//   - every banner is checked on the server: the title (40 characters; a stored
//     longer one - the owner's loyalty banner - stays), 1-2 buttons, links inside
//     the shop or https, platforms, pictures, dates, at most 5 published;
//   - until the panel saves, the owner's five banners are the home;
//   - the config gives each platform its banners (the website the text and the
//     photo, an app its picture) within their dates, and the sections in order,
//     and a save replaces it at once;
//   - pictures upload as real JPEG/PNG/WebP files of a sensible size;
//   - the Instagram posts are edited here by marketing too;
//   - with Odoo, the home is the system parameter brimatex.app.home, and an Odoo
//     that refuses the write answers 503 and keeps the old value.
//
// Runs with the rest: npm test

'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { startTestServer } = require('./_server');
const home = require('../src/lib/home');

const PORT = Number(process.env.TEST_PORT || 3221);
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

/** The first bytes of a PNG of this size - enough for the server's checks, which read the header. */
function pngDataUrl(width, height) {
  const buf = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return 'data:image/png;base64,' + buf.toString('base64');
}

/** A JPEG header with its frame size (SOF0) after an APP0 segment. */
function jpegBuffer(width, height) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(16)]);
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/** A new banner the way the panel sends one. */
function newBanner(overrides = {}) {
  return {
    id: 'test-' + Math.random().toString(16).slice(2, 8),
    status: 'published',
    tag: 'عرض',
    title: 'عرض الصيف على كلاسيك',
    text: 'خصم على كل المقاسات حتى نهاية الشهر.',
    buttons: [{ label: 'تسوّق الآن', link: '/offers' }],
    link: '/offers',
    panel: '#282868',
    photo: '/images/banners/deluxe-photo.jpg',
    appImage: '/images/banners/deluxe-app.jpg',
    platforms: ['ios', 'android', 'web'],
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

function unit() {
  console.log('\n\x1b[1m0. القواعد (src/lib/home.js)\x1b[0m');
  const d = home.defaults();
  ok('الافتراضي: بانرات المالك الخمسة، كلها منشورة', d.banners.map((b) => b.key).join() === 'deluxe,balance,hotel,comfort,loyalty' && d.banners.every((b) => b.status === 'published'));
  ok('الافتراضي: الأقسام السبعة مفعّلة بالترتيب', d.sections.map((s) => s.key).join() === home.SECTION_KEYS.join() && d.sections.every((s) => s.on));
  ok('بانر النقاط كما صُمّم (60 د.ل)', /60 د\.ل/.test(d.banners[4].title) && d.banners[4].card?.value === '60 د.ل');

  ok('رابط تسويقي /p/<slug>?variant=', home.cleanLink('/p/hotel?variant=5632') === '/p/hotel?variant=5632');
  ok('صفحة فئة وعروض والنقاط', ['/mattresses/elite', '/offers', '/account/loyalty', '/product/5852'].every((l) => home.cleanLink(l) === l));
  ok('رابط https مقبول', home.cleanLink('https://www.instagram.com/brimatex.ly/') === 'https://www.instagram.com/brimatex.ly/');
  ok('صفحة غير موجودة مرفوضة', home.cleanLink('/nope') === null);
  ok('// و javascript: و http مرفوضة', [ '//evil.example', 'javascript:alert(1)', 'http://brimatex.ly/' ].every((l) => home.cleanLink(l) === null));

  const err = (input, before) => {
    try {
      home.validate(input, before);
      return null;
    } catch (e) {
      return e;
    }
  };
  const long = newBanner({ title: 'ع'.repeat(41) });
  ok('عنوان جديد فوق 40 حرفاً ← خطأ في العنوان', err({ banners: [long] })?.field === 'title' && err({ banners: [long] })?.banner === long.id);
  ok('عنوان 40 حرفاً بالضبط مقبول', !err({ banners: [newBanner({ title: 'ع'.repeat(40) })] }));
  ok('عنوان النقاط المخزّن (45 حرفاً) يبقى', !err(d, d));
  const edited = clone(d);
  edited.banners[4].title += '!';
  ok('وإن عُدّل يُطبَّق الحد', err(edited, d)?.field === 'title');

  const six = clone(d);
  six.banners.push(newBanner());
  const sixErr = err(six, d);
  ok('ستة منشورة ← خطأ max_published', sixErr?.code === 'max_published' && sixErr?.status === 400, sixErr?.message);
  six.banners[5].status = 'draft';
  ok('السادس مسودة ← مقبول', !err(six, d));

  ok('بلا أزرار ← خطأ', err({ banners: [newBanner({ buttons: [] })] })?.field === 'buttons');
  ok('ثلاثة أزرار ← خطأ', err({ banners: [newBanner({ buttons: [1, 2, 3].map(() => ({ label: 'زر', link: '/offers' })) })] })?.field === 'buttons');
  ok('زر برابط خارج المتجر ← خطأ', err({ banners: [newBanner({ buttons: [{ label: 'زر', link: '/nope' }] })] })?.field === 'buttons.0.link');
  ok('رابط البانر غير صالح ← خطأ', err({ banners: [newBanner({ link: 'ftp://x' })] })?.field === 'link');
  ok('بلا منصة ← خطأ', err({ banners: [newBanner({ platforms: [] })] })?.field === 'platforms');
  ok('الموقع بلا صورة ← خطأ', err({ banners: [newBanner({ photo: null })] })?.field === 'photo');
  ok('التطبيق بلا صورة ← خطأ', err({ banners: [newBanner({ appImage: null })] })?.field === 'appImage');
  ok('صورة من خارج الخادم ← خطأ', err({ banners: [newBanner({ photo: 'https://evil.example/x.jpg' })] })?.field === 'photo');
  ok('تاريخ غير صالح ← خطأ', err({ banners: [newBanner({ startsAt: '2026-02-30' })] })?.field === 'startsAt');
  ok('النهاية قبل البداية ← خطأ', err({ banners: [newBanner({ startsAt: '2026-10-10', endsAt: '2026-10-01' })] })?.field === 'endsAt');
  ok('لون غير صالح ← خطأ', err({ banners: [newBanner({ panel: 'navy' })] })?.field === 'panel');
  const dup = newBanner();
  ok('معرّف مكرر ← خطأ', err({ banners: [dup, { ...dup, key: 'other' }] })?.field === 'id');
  ok('الأقسام: المجهول يُحذف والناقص يُضاف', home.validate({ banners: [], sections: [{ key: 'quiz', on: false }, { key: 'nope' }] }).sections.map((s) => `${s.key}:${s.on}`).join() === 'quiz:false,hero:true,offers:true,categories:true,recent:true,bestsellers:true,instagram:true');

  // The config: platform and dates (Libyan days).
  const now = new Date('2026-10-03T10:00:00Z');
  const value = home.validate({
    banners: [
      newBanner({ id: 'web-only', platforms: ['web'] }),
      newBanner({ id: 'ios-only', platforms: ['ios'], appImages: { ios: '/images/banners/deluxe-ios.jpg' } }),
      newBanner({ id: 'later', startsAt: '2026-10-04' }),
      newBanner({ id: 'over', endsAt: '2026-10-02' }),
      newBanner({ id: 'today', startsAt: '2026-10-03', endsAt: '2026-10-03' }),
      newBanner({ id: 'draft', status: 'draft' }),
    ],
  });
  const ids = (p) => home.publicHome(value, p, now).banners.map((b) => b.id).join();
  ok('الموقع: الخاص به وما في تاريخه', ids('web') === 'web-only,today', ids('web'));
  ok('iOS: الخاص به وما في تاريخه', ids('ios') === 'ios-only,today', ids('ios'));
  ok('أندرويد', ids('android') === 'today', ids('android'));
  const iosBanner = home.publicHome(value, 'ios', now).banners[0];
  ok('iOS يأخذ صورته الخاصة', iosBanner.image === '/images/banners/deluxe-ios.jpg' && !('buttons' in iosBanner));
  ok('أندرويد يأخذ صورة التطبيق العامة', home.publicHome(value, 'android', now).banners[0].image === '/images/banners/deluxe-app.jpg');
  const webBanner = home.publicHome(value, 'web', now).banners[0];
  ok('الموقع يأخذ النص والأزرار والصورة', webBanner.title && webBanner.buttons.length === 1 && webBanner.photo && !('image' in webBanner));
  // 22:30 UTC is 00:30 on the 4th in Libya: «today» has ended and «later» has begun.
  const pastMidnight = home.publicHome(value, 'web', new Date('2026-10-03T22:30:00Z')).banners.map((b) => b.id).join();
  ok('منتصف الليل في ليبيا يحسب اليوم الليبي', pastMidnight === 'web-only,later', pastMidnight);
  ok('منصة مجهولة ← الموقع', home.platformOf('windows') === 'web' && home.platformOf('ios') === 'ios');

  ok('مقاس PNG من رأسه', JSON.stringify(home.imageSize(Buffer.from(pngDataUrl(1600, 900).split(',')[1], 'base64'))) === '{"width":1600,"height":900}');
  ok('مقاس JPEG من رأسه', JSON.stringify(home.imageSize(jpegBuffer(1080, 1350))) === '{"width":1080,"height":1350}');
  const seedPhoto = path.join(__dirname, '..', 'web', 'public', 'images', 'banners', 'deluxe-photo.jpg');
  ok('صور البانرات الخمسة مشحونة مع الموقع', d.banners.every((b) => [b.photo, b.appImage, ...Object.values(b.appImages || {})].every((u) => fs.existsSync(path.join(__dirname, '..', 'web', 'public', u)))));
  ok('صورة الموقع 1600 عرضاً', home.imageSize(fs.readFileSync(seedPhoto))?.width === 1600);
}

async function register(port, name, phone) {
  const r = await req(port, 'POST', '/api/auth/register', { name, phone, password: 'secret123' });
  return { token: r.json?.token, id: r.json?.user?.id, status: r.status };
}

async function localServer() {
  const ADMIN_PHONE = uniq();
  const file = tempFile('home');
  const { server, out } = await startTestServer({ port: PORT, env: { ADMIN_PHONES: ADMIN_PHONE, BRIMATEX_SETTINGS_FILE: file } });
  const r = (...args) => req(PORT, ...args);
  const uploaded = [];
  try {
    console.log('\n\x1b[1m1. الرئيسية في /api/app/v1/config\x1b[0m');
    const cfg = await r('GET', '/api/app/v1/config');
    ok('بلا دخول ← 200، ومعه الإعدادات', cfg.status === 200 && cfg.json?.settings?.contact);
    const web = cfg.json?.home;
    ok('بلا منصة ← بانرات الموقع الخمسة', web?.banners?.length === 5 && web.banners.every((b) => b.photo && b.buttons?.length === 2), JSON.stringify(web?.banners?.map((b) => b.key)));
    ok('والأقسام بالترتيب', web?.sections?.map((s) => s.key).join() === home.SECTION_KEYS.join());
    const ios = (await r('GET', '/api/app/v1/config?platform=ios')).json?.home;
    ok('iOS: صورة iOS لكل بانر', ios?.banners?.length === 5 && ios.banners.every((b) => /-ios\.jpg$/.test(b.image) && b.link), JSON.stringify(ios?.banners?.[0]));
    const android = (await r('GET', '/api/app/v1/config?platform=android')).json?.home;
    ok('أندرويد: صورة أندرويد', android?.banners?.every((b) => /-android\.jpg$/.test(b.image)));
    ok('لا أسرار فيه', !/apiKey|token|password|odoo/i.test(cfg.text));

    console.log('\n\x1b[1m2. الصلاحيات: المدير والتسويق نعم، خدمة العملاء لا\x1b[0m');
    const admin = await register(PORT, 'المدير', ADMIN_PHONE);
    const customer = await register(PORT, 'عميل', uniq());
    const marketing = await register(PORT, 'التسويق', uniq());
    const support = await register(PORT, 'خدمة العملاء', uniq());
    ok('الحسابات تُسجَّل', [admin, customer, marketing, support].every((a) => a.status === 201 && a.token));
    await r('PATCH', `/api/panel/users/${marketing.id}/role`, { role: 'marketing' }, bearer(admin.token));
    await r('PATCH', `/api/panel/users/${support.id}/role`, { role: 'support' }, bearer(admin.token));

    ok('بلا رمز ← 401', (await r('GET', '/api/panel/home')).status === 401);
    ok('العميل ← 403', (await r('GET', '/api/panel/home', null, bearer(customer.token))).status === 403);
    const sp = await r('GET', '/api/panel/home', null, bearer(support.token));
    ok('خدمة العملاء ← 403 (section)', sp.status === 403 && sp.json?.code === 'section');
    ok('خدمة العملاء لا تحفظ ← 403', (await r('PUT', '/api/panel/home', { home: { banners: [] } }, bearer(support.token))).status === 403);
    ok('خدمة العملاء لا ترفع صورة ← 403', (await r('POST', '/api/panel/home/images', { imageDataUrl: pngDataUrl(1600, 900), kind: 'photo' }, bearer(support.token))).status === 403);
    ok('خدمة العملاء لا ترى إنستغرام ← 403', (await r('GET', '/api/panel/home/instagram', null, bearer(support.token))).status === 403);
    const mk = await r('GET', '/api/panel/home', null, bearer(marketing.token));
    ok('التسويق يقرأ ← 200', mk.status === 200 && mk.json?.home?.banners?.length === 5 && mk.json?.storage === 'local', `${mk.status}`);
    ok('والحدود', mk.json?.limits?.maxPublished === 5 && mk.json?.limits?.titleMax === 40);
    const ad = await r('GET', '/api/panel/home', null, bearer(admin.token));
    ok('المدير يقرأ ← 200', ad.status === 200);
    ok('التسويق يرى إنستغرام ← 200', (await r('GET', '/api/panel/home/instagram', null, bearer(marketing.token))).json?.max === 5);

    console.log('\n\x1b[1m3. التحقق في الخادم\x1b[0m');
    const base = mk.json.home;
    const bad = async (label, mutate, field) => {
      const doc = clone(base);
      mutate(doc);
      const res = await r('PUT', '/api/panel/home', { home: doc }, bearer(marketing.token));
      ok(`${label} ← 400 (${field})`, res.status === 400 && res.json?.field === field, `${res.status} ${JSON.stringify(res.json)}`);
    };
    await bad('عنوان جديد طويل', (d) => (d.banners[0].title = 'ع'.repeat(41)), 'title');
    await bad('بانر سادس منشور', (d) => d.banners.push(newBanner()), 'status');
    await bad('رابط زر خارج المتجر', (d) => (d.banners[1].buttons[0].link = '/nope'), 'buttons.0.link');
    await bad('تاريخ نهاية قبل البداية', (d) => Object.assign(d.banners[2], { startsAt: '2026-11-10', endsAt: '2026-11-01' }), 'endsAt');
    await bad('تاريخ غير صالح', (d) => (d.banners[2].startsAt = '10/11/2026'), 'startsAt');
    await bad('بلا منصة', (d) => (d.banners[3].platforms = []), 'platforms');
    const junk = await r('PUT', '/api/panel/home', null, { ...bearer(marketing.token), 'Content-Type': 'application/json' });
    ok('جسم فارغ ← 400', junk.status === 400);
    ok('لم يتغيّر شيء', (await r('GET', '/api/app/v1/config')).json?.home?.banners?.length === 5);

    console.log('\n\x1b[1m4. الحفظ يصل إلى الإعداد العام فوراً\x1b[0m');
    const doc = clone(base);
    // Loyalty first, comfort a draft, a new web-only banner, one that starts tomorrow; quiz off and first.
    const loyalty = doc.banners.find((b) => b.key === 'loyalty');
    doc.banners = [loyalty, ...doc.banners.filter((b) => b !== loyalty)];
    doc.banners.find((b) => b.key === 'comfort').status = 'draft';
    const tomorrow = new Date(Date.now() + 2 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
    doc.banners.find((b) => b.key === 'hotel').startsAt = tomorrow;
    doc.banners.push(newBanner({ id: 'summer', key: 'summer', platforms: ['web'] }));
    doc.sections = [{ key: 'quiz', on: true }, ...doc.sections.filter((s) => s.key !== 'quiz').map((s) => (s.key === 'instagram' ? { ...s, on: false } : s))];
    const saved = await r('PUT', '/api/panel/home', { home: doc }, bearer(marketing.token));
    ok('التسويق يحفظ ← 200', saved.status === 200, `${saved.status} ${JSON.stringify(saved.json)}`);
    ok('عنوان النقاط بقي كما هو', saved.json?.home?.banners?.[0]?.title === loyalty.title);
    ok('محفوظ في ملف الخادم', JSON.parse(fs.readFileSync(file, 'utf8')).home?.banners?.length === 6);
    const after = (await r('GET', '/api/app/v1/config')).json?.home;
    ok('الموقع: الترتيب الجديد بلا المسودة ولا المؤجّل', after?.banners?.map((b) => b.key).join() === 'loyalty,deluxe,balance,summer', JSON.stringify(after?.banners?.map((b) => b.key)));
    ok('الأقسام: ساعدني أختار أولاً، وإنستغرام مطفأ', after?.sections?.[0]?.key === 'quiz' && after.sections.find((s) => s.key === 'instagram')?.on === false);
    const appAfter = (await r('GET', '/api/app/v1/config?platform=android')).json?.home;
    ok('أندرويد: بلا بانر الموقع وحده', appAfter?.banners?.map((b) => b.key).join() === 'loyalty,deluxe,balance', JSON.stringify(appAfter?.banners?.map((b) => b.key)));
    ok('نظرة عامة: أول ما يراه العملاء', (await r('GET', '/api/panel/overview', null, bearer(admin.token))).json?.banner?.title === loyalty.title);

    console.log('\n\x1b[1m5. رفع الصور\x1b[0m');
    const up = await r('POST', '/api/panel/home/images', { imageDataUrl: pngDataUrl(1600, 900), kind: 'photo' }, bearer(marketing.token));
    ok('صورة موقع 1600×900 ← 201', up.status === 201 && /^\/uploads\/home\/photo-[a-f0-9]{16}\.png$/.test(up.json?.url || '') && up.json?.width === 1600, JSON.stringify(up.json));
    if (up.json?.url) uploaded.push(up.json.url);
    ok('وتُخدم', (await r('GET', up.json?.url || '/x')).status === 200);
    const app = await r('POST', '/api/panel/home/images', { imageDataUrl: 'data:image/jpeg;base64,' + jpegBuffer(1080, 1350).toString('base64'), kind: 'app' }, bearer(admin.token));
    ok('صورة تطبيق 1080×1350 ← 201', app.status === 201 && app.json?.height === 1350, JSON.stringify(app.json));
    if (app.json?.url) uploaded.push(app.json.url);
    const small = await r('POST', '/api/panel/home/images', { imageDataUrl: pngDataUrl(640, 360), kind: 'photo' }, bearer(marketing.token));
    ok('صورة صغيرة ← 400 بالمقاس المطلوب', small.status === 400 && /1600×900/.test(small.json?.error || ''), JSON.stringify(small.json));
    const fake = await r('POST', '/api/panel/home/images', { imageDataUrl: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64'), kind: 'photo' }, bearer(marketing.token));
    ok('ملف نصي باسم صورة ← 400', fake.status === 400);
    ok('نوع مجهول ← 400', (await r('POST', '/api/panel/home/images', { imageDataUrl: pngDataUrl(1600, 900), kind: 'icon' }, bearer(marketing.token))).status === 400);
    const withUpload = clone(saved.json.home);
    withUpload.banners.find((b) => b.key === 'summer').photo = up.json?.url;
    ok('البانر يحفظ عنوان الصورة المرفوعة', (await r('PUT', '/api/panel/home', { home: withUpload }, bearer(marketing.token))).json?.home?.banners?.find((b) => b.key === 'summer')?.photo === up.json?.url);

    console.log('\n\x1b[1m6. العناوين\x1b[0m');
    for (const p of ['/admin/home', '/p/deluxe', '/account/loyalty', '/account/coupons']) {
      const res = await r('GET', p);
      ok(`${p} ← 200 الواجهة`, res.status === 200 && res.text.includes('<div id="root">'), 'status ' + res.status);
    }
    ok('/p/Deluxe!! ← 404', (await r('GET', '/p/Deluxe!!')).status === 404);
  } catch (err) {
    fail++;
    failures.push('استثناء: ' + err.message);
    console.error(err);
    console.error(out.text);
  } finally {
    server.kill();
    fs.rmSync(file, { force: true });
    for (const u of uploaded) fs.rmSync(path.join(__dirname, '..', 'src', 'public', u), { force: true });
  }
}

/** Just enough of Odoo's JSON-RPC: login, and ir.config_parameter get_param / set_param. */
function fakeOdoo() {
  const state = { params: {}, setCalls: 0, deny: false };
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
      if (model === 'ir.config_parameter' && method === 'get_param') return reply({ result: state.params[args?.[0]] ?? false });
      if (model === 'ir.config_parameter' && method === 'set_param') {
        state.setCalls++;
        if (state.deny) return error('odoo.exceptions.AccessError', "You are not allowed to modify 'System Parameter' (ir.config_parameter) records.");
        state.params[args[0]] = args[1];
        return reply({ result: true });
      }
      // The catalogue and the rest: nothing here.
      return error('odoo.exceptions.UserError', `not in the fake: ${model}.${method}`);
    });
  });
  return new Promise((resolve) => server.listen(FAKE_ODOO_PORT, '127.0.0.1', () => resolve({ server, state })));
}

async function odooServer() {
  const ADMIN_PHONE = uniq();
  const file = tempFile('home-odoo');
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
    console.log('\n\x1b[1m7. مع أودو: المعامل brimatex.app.home\x1b[0m');
    const admin = await register(ODOO_PORT, 'المدير', ADMIN_PHONE);
    const got = await r('GET', '/api/panel/home', null, bearer(admin.token));
    ok('المخزن: أودو، والبانرات الخمسة قبل أول حفظ', got.status === 200 && got.json?.storage === 'odoo' && got.json?.home?.banners?.length === 5, `${got.status} ${JSON.stringify(got.json)?.slice(0, 200)}`);
    const doc = clone(got.json.home);
    doc.banners[1].status = 'draft';
    const saved = await r('PUT', '/api/panel/home', { home: doc }, bearer(admin.token));
    ok('الحفظ ← set_param', saved.status === 200 && odoo.state.setCalls === 1, `${saved.status} ${JSON.stringify(saved.json)}`);
    const param = JSON.parse(odoo.state.params['brimatex.app.home'] || '{}');
    ok('المعامل JSON: البانرات والأقسام وعناوين الصور', param.banners?.length === 5 && param.banners[1].status === 'draft' && param.sections?.length === 7 && param.banners[0].photo === '/images/banners/deluxe-photo.jpg');
    ok('الإعداد العام: أربعة', (await r('GET', '/api/app/v1/config')).json?.home?.banners?.length === 4);

    odoo.state.deny = true;
    const before = odoo.state.params['brimatex.app.home'];
    doc.banners[1].status = 'published';
    const denied = await r('PUT', '/api/panel/home', { home: doc }, bearer(admin.token));
    ok('أودو يرفض ← 503 برسالة الصلاحية', denied.status === 503 && denied.json?.error === 'تعذّر الحفظ في أودو: حساب الربط يحتاج صلاحية الإعدادات', `${denied.status} ${JSON.stringify(denied.json)}`);
    ok('القيمة القديمة باقية في أودو', odoo.state.params['brimatex.app.home'] === before);
    ok('وفي الإعداد العام', (await r('GET', '/api/app/v1/config')).json?.home?.banners?.length === 4);
    ok('ولا شيء في ملف الخادم', !JSON.parse(fs.readFileSync(file, 'utf8')).home);
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
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — الواجهة والبانرات ═══\x1b[0m');
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
