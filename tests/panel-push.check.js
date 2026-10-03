#!/usr/bin/env node
// The panel's «الإشعارات» - offer notifications (/api/panel/push) and the
// app's preferences on POST /api/devices.
//
// What it guards:
//   - admin and marketing read and send; support and customers cannot;
//   - the app's «العروض», city and cart time are kept on the device, an
//     order's registration does not reset them, and an older app's
//     registration leaves offers off;
//   - the audiences: everyone with offers on, one city, a recent full cart -
//     never a device with offers off; their sizes before sending;
//   - the server refuses a long title, an empty text, a link outside the shop,
//     a past schedule, «قريباً» - and logs nothing;
//   - the Expo payload: to, title, body, channelId, data: { kind, link, campaignId };
//   - the weekly limit: devices over it are skipped and counted; a dead token is
//     dropped;
//   - «إرسال تجريبي لجهازي» reaches only the staff member's own devices, offers
//     on or not, and is marked as a test;
//   - inside the quiet hours a send is held until they end, and a held or
//     scheduled one can be cancelled; a scheduled one goes out once, by the timer;
//   - the overview's «آخر إشعار عرض» is the last campaign sent (not a test);
//   - with Odoo, the log is the system parameter brimatex.app.push, and an Odoo
//     that refuses the write answers 503 and sends nothing.
//
// Expo is faked (BRIMATEX_EXPO_PUSH_URL): nothing leaves this machine.
// Runs with the rest: npm test

'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { startTestServer } = require('./_server');
const lib = require('../src/lib/pushCampaigns');

const PORT = Number(process.env.TEST_PORT || 3281);
const EXPO_PORT = PORT + 1;
const ODOO_PORT = PORT + 2;
const FAKE_ODOO_PORT = PORT + 3;
const uniq = () => '09' + Math.floor(10000000 + Math.random() * 89999999);
const HOUR = 3600_000;

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = (name) => path.join(os.tmpdir(), `brimatex-${name}-${process.pid}-${Date.now()}`);
const libyaHour = (offsetHours = 0) => String((new Date(Date.now() + 2 * HOUR).getUTCHours() + offsetHours + 24) % 24).padStart(2, '0');
/** Quiet hours that do not include now (they start 3 hours from now). */
const quietLater = () => ({ from: `${libyaHour(3)}:00`, to: `${libyaHour(5)}:00` });
/** Quiet hours around now - to 2 hours on, so a send scheduled 10 minutes ahead is inside them at any minute of the hour. */
const quietNow = () => ({ from: `${libyaHour(-1)}:00`, to: `${libyaHour(2)}:00` });
/** Libyan local time `ms` from now, with seconds - what the panel sends, finer. */
const libyaLocal = (ms) => new Date(Date.now() + ms + 2 * HOUR).toISOString().slice(0, 19);

async function register(port, name, phone) {
  const r = await req(port, 'POST', '/api/auth/register', { name, phone, password: 'secret123' });
  return { token: r.json?.token, id: r.json?.user?.id, status: r.status };
}

/** Expo's push endpoint: records every message, and answers DeviceNotRegistered for a token with «dead» in it. */
function fakeExpo() {
  const state = { messages: [], requests: 0 };
  const server = http.createServer((rq, rs) => {
    let raw = '';
    rq.on('data', (c) => (raw += c));
    rq.on('end', () => {
      state.requests++;
      const list = JSON.parse(raw || '[]');
      state.messages.push(...list);
      rs.writeHead(200, { 'Content-Type': 'application/json' });
      rs.end(
        JSON.stringify({
          data: list.map((m) =>
            m.to.includes('dead') ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'ticket-' + state.messages.length }
          ),
        })
      );
    });
  });
  return new Promise((resolve) => server.listen(EXPO_PORT, '127.0.0.1', () => resolve({ server, state })));
}

/* ------------------------------------------------------------------ 0 */

function unit() {
  console.log('\n\x1b[1m0. القواعد (بلا خادم)\x1b[0m');
  const quiet = { from: '22:00', to: '08:00' };
  // 2026-10-05 23:30 Libya = 21:30Z.
  const at2330 = Date.UTC(2026, 9, 5, 21, 30);
  const q = lib.quietState(at2330, quiet);
  ok('23:30 داخل ساعات الهدوء، وتنتهي 08:00 صباح الغد', q.inside && q.endsAt === Date.UTC(2026, 9, 6, 6, 0), JSON.stringify(q));
  const at0300 = Date.UTC(2026, 9, 6, 1, 0);
  ok('03:00 داخلها، وتنتهي 08:00 اليوم نفسه', lib.quietState(at0300, quiet).endsAt === Date.UTC(2026, 9, 6, 6, 0));
  ok('08:00 تماماً خارجها', !lib.quietState(Date.UTC(2026, 9, 6, 6, 0), quiet).inside);
  ok('21:59 خارجها', !lib.quietState(Date.UTC(2026, 9, 6, 19, 59), quiet).inside);
  ok('نافذة لا تعبر منتصف الليل (13:00-15:00)', lib.quietState(Date.UTC(2026, 9, 6, 12, 0), { from: '13:00', to: '15:00' }).inside && !lib.quietState(Date.UTC(2026, 9, 6, 13, 0), { from: '13:00', to: '15:00' }).inside);
  ok('موعد بتوقيت ليبيا ← UTC', lib.parseLibyaTime('2026-10-05T10:00') === Date.UTC(2026, 9, 5, 8, 0));
  ok('31 فبراير مرفوض', Number.isNaN(lib.parseLibyaTime('2026-02-31T10:00')));

  const bad = (input, field) => {
    try {
      lib.validateMessage(input);
      return false;
    } catch (err) {
      return err.field === field;
    }
  };
  ok('عنوان من 41 حرفاً ← title', bad({ title: 'ع'.repeat(41), body: 'نص' }, 'title'));
  ok('نص من 121 حرفاً ← body', bad({ title: 'عرض', body: 'ن'.repeat(121) }, 'body'));
  ok('رابط خارج المتجر ← link', bad({ title: 'عرض', body: 'نص', link: 'https://example.com' }, 'link'));
  const m = lib.validateMessage({ title: ' عرض على  بالانس ', body: 'خصم 20٪ حتى 10 أكتوبر.', link: '/p/balance', linkLabel: 'صفحة منتج: بالانس' });
  ok('العنوان يُنظَّف، والرابط يبقى', m.title === 'عرض على بالانس' && m.link === '/p/balance');
  ok('بلا رابط: يفتح التطبيق', lib.validateMessage({ title: 'عرض', body: 'نص' }).link === '');

  const now = Date.now();
  ok('العروض مطفأة ← خارج كل جمهور', !lib.inAudience({ offers: false, city: 'طرابلس' }, { kind: 'offers' }, now));
  ok('مدينة', lib.inAudience({ offers: true, city: 'طرابلس' }, { kind: 'city', city: 'طرابلس' }, now) && !lib.inAudience({ offers: true, city: 'بنغازي' }, { kind: 'city', city: 'طرابلس' }, now));
  ok('سلة قبل يوم: نعم، قبل 8 أيام: لا', lib.inAudience({ offers: true, cartAt: new Date(now - 24 * HOUR).toISOString() }, { kind: 'cart' }, now) && !lib.inAudience({ offers: true, cartAt: new Date(now - 8 * 24 * HOUR).toISOString() }, { kind: 'cart' }, now));

  const msg = lib.message({ id: 'abc', title: 'عرض', body: 'نص', link: '/offers' }, 'ExponentPushToken[x]');
  ok('شكل رسالة Expo', msg.to === 'ExponentPushToken[x]' && msg.title === 'عرض' && msg.body === 'نص' && msg.channelId === 'offers' && JSON.stringify(msg.data) === JSON.stringify({ kind: 'offer', link: '/offers', campaignId: 'abc' }));
}

/* ------------------------------------------------------------------ 1-9 */

async function localServer(expo) {
  const ADMIN_PHONE = uniq();
  const settingsFile = tmp('push-settings') + '.json';
  fs.writeFileSync(settingsFile, '{}\n');
  const pushFile = tmp('push-log') + '.json';
  const devicesFile = tmp('push-devices') + '.jsonl';
  const { server, out } = await startTestServer({
    port: PORT,
    env: {
      ADMIN_PHONES: ADMIN_PHONE,
      BRIMATEX_SETTINGS_FILE: settingsFile,
      BRIMATEX_PUSH_FILE: pushFile,
      BRIMATEX_DEVICES_FILE: devicesFile,
      BRIMATEX_EXPO_PUSH_URL: `http://127.0.0.1:${EXPO_PORT}/--/api/v2/push/send`,
      BRIMATEX_PUSH_TICK_MS: '400',
    },
  });
  const r = (...args) => req(PORT, ...args);
  const sentTo = (campaignId) => expo.state.messages.filter((m) => m.data?.campaignId === campaignId).map((m) => m.to);
  try {
    const admin = await register(PORT, 'المدير', ADMIN_PHONE);
    const customer = await register(PORT, 'عميل', uniq());
    const marketing = await register(PORT, 'التسويق', uniq());
    const support = await register(PORT, 'خدمة العملاء', uniq());
    await r('PATCH', `/api/panel/users/${marketing.id}/role`, { role: 'marketing' }, bearer(admin.token));
    await r('PATCH', `/api/panel/users/${support.id}/role`, { role: 'support' }, bearer(admin.token));

    const setQuiet = async (quietHours) => {
      const got = await r('GET', '/api/panel/settings', null, bearer(admin.token));
      const saved = await r('PUT', '/api/panel/settings', { settings: { ...got.json.settings, quietHours } }, bearer(admin.token));
      return saved.status === 200;
    };
    ok('ساعات الهدوء بعيدة عن الآن', await setQuiet(quietLater()));

    console.log('\n\x1b[1m1. الصلاحيات: المدير والتسويق نعم، خدمة العملاء لا\x1b[0m');
    ok('بلا رمز ← 401', (await r('GET', '/api/panel/push')).status === 401);
    ok('العميل ← 403', (await r('GET', '/api/panel/push', null, bearer(customer.token))).status === 403);
    const sp = await r('GET', '/api/panel/push', null, bearer(support.token));
    ok('خدمة العملاء ← 403 (section)', sp.status === 403 && sp.json?.code === 'section');
    ok('خدمة العملاء لا ترسل ← 403', (await r('POST', '/api/panel/push', { title: 'عرض', body: 'نص', audience: { kind: 'offers' } }, bearer(support.token))).status === 403);
    ok('العميل لا يرسل تجريبياً ← 403', (await r('POST', '/api/panel/push/test', { title: 'عرض', body: 'نص' }, bearer(customer.token))).status === 403);
    const mk = await r('GET', '/api/panel/push', null, bearer(marketing.token));
    ok('التسويق يقرأ ← 200: سجل فارغ، الحد 2، خدمة Expo', mk.status === 200 && mk.json?.campaigns?.length === 0 && mk.json?.perWeek === 2 && mk.json?.service === 'expo' && mk.json?.storage === 'local', `${mk.status} ${JSON.stringify(mk.json)?.slice(0, 200)}`);
    ok('المدير يقرأ ← 200', (await r('GET', '/api/panel/push', null, bearer(admin.token))).status === 200);

    console.log('\n\x1b[1m2. تفضيلات الجهاز من التطبيق\x1b[0m');
    const T = (name) => `ExponentPushToken[${name}-${Date.now()}]`;
    const d = { tripoli: T('tripoli'), benghazi: T('benghazi'), off: T('off'), legacy: T('legacy'), cart: T('cart'), oldCart: T('oldcart'), dead: T('dead'), mine: T('mine') };
    const dev = (body, headers) => r('POST', '/api/devices', body, headers);
    const day = 24 * HOUR;
    const regs = await Promise.all([
      dev({ token: d.tripoli, platform: 'ios', offers: true, city: ' طرابلس ' }),
      dev({ token: d.benghazi, platform: 'android', offers: true, city: 'بنغازي' }),
      dev({ token: d.off, platform: 'ios', offers: false, city: 'طرابلس' }),
      dev({ token: d.legacy, platform: 'ios', orderName: 'S00001' }),
      dev({ token: d.cart, platform: 'ios', offers: true, city: 'طرابلس', cartAt: new Date(Date.now() - day).toISOString() }),
      dev({ token: d.oldCart, platform: 'android', offers: true, city: 'مصراتة', cartAt: new Date(Date.now() - 8 * day).toISOString() }),
      dev({ token: d.dead, platform: 'ios', offers: true, city: 'سرت' }),
    ]);
    ok('كل الأجهزة تُسجَّل ← 200', regs.every((x) => x.status === 200), regs.map((x) => x.status).join());
    // The file store writes one at a time; sequential registrations below.
    await dev({ token: d.mine, platform: 'ios', offers: false }, bearer(marketing.token));
    // An order's registration (no preferences) keeps them.
    await dev({ token: d.tripoli, platform: 'ios', orderName: 'S00042' });
    const rows = fs.readFileSync(devicesFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const row = (t) => rows.find((x) => x.token === t);
    ok('العروض والمدينة محفوظة (والمسافات تُزال)', row(d.benghazi)?.offers === true && row(d.benghazi)?.city === 'بنغازي');
    ok('تسجيل طلب بلا تفضيلات يبقيها', row(d.tripoli)?.offers === true && row(d.tripoli)?.city === 'طرابلس' && row(d.tripoli)?.lastOrder === 'S00042');
    ok('تطبيق قديم بلا تفضيلات: العروض مطفأة', row(d.legacy)?.offers === false && row(d.legacy)?.lastOrder === 'S00001');
    ok('جهاز التسويق مربوط بحسابه', row(d.mine)?.userId === marketing.id);

    const ov = (await r('GET', '/api/panel/push', null, bearer(marketing.token))).json;
    const offersOn = rows.filter((x) => x.offers).length;
    ok('حجم «كل من فعّل العروض» قبل الإرسال', ov?.audiences?.offers?.devices === offersOn && offersOn === 5, `${ov?.audiences?.offers?.devices} / ${offersOn}`);
    ok('المدن: طرابلس 2 (لا يُحسب من أطفأ العروض)', ov?.audiences?.cities?.find((c) => c.city === 'طرابلس')?.devices === 2, JSON.stringify(ov?.audiences?.cities));
    ok('السلة: جهاز واحد (سلة قبل 8 أيام لا تُحسب)', ov?.audiences?.cart?.devices === 1);
    ok('أجهزتي: 1', ov?.myDevices === 1);

    console.log('\n\x1b[1m3. التحقق في الخادم\x1b[0m');
    const base = { title: 'عرض على بالانس', body: 'خصم 20٪ حتى 10 أكتوبر. اطلب والدفع عند الاستلام.', link: '/p/balance', linkLabel: 'صفحة منتج: بالانس', audience: { kind: 'offers' }, when: 'now' };
    const refuse = async (label, patch, field, code) => {
      const res = await r('POST', '/api/panel/push', { ...base, ...patch }, bearer(marketing.token));
      ok(`${label} ← 400 (${field || code})`, res.status === 400 && (field ? res.json?.field === field : res.json?.code === code), `${res.status} ${JSON.stringify(res.json)}`);
    };
    await refuse('عنوان أطول من 40', { title: 'ع'.repeat(41) }, 'title');
    await refuse('نص فارغ', { body: '   ' }, 'body');
    await refuse('رابط خارجي', { link: 'https://example.com' }, 'link');
    await refuse('«من شاهد مرتبة» قريباً', { audience: { kind: 'viewed' } }, null, 'soon');
    await refuse('مدينة بلا اسم', { audience: { kind: 'city', city: '' } }, 'audience.city');
    await refuse('موعد مضى', { when: 'schedule', at: libyaLocal(-2 * HOUR) }, 'at');
    await refuse('موعد غير مفهوم', { when: 'schedule', at: 'غداً' }, 'at');
    const empty = await r('POST', '/api/panel/push', { ...base, audience: { kind: 'city', city: 'غات' } }, bearer(marketing.token));
    ok('جمهور بلا أجهزة ← 409', empty.status === 409 && empty.json?.code === 'empty');
    ok('لا شيء في السجل ولا شيء أُرسل', (await r('GET', '/api/panel/push', null, bearer(marketing.token))).json?.campaigns?.length === 0 && expo.state.messages.length === 0);

    console.log('\n\x1b[1m4. إرسال لمدينة: شكل رسالة Expo\x1b[0m');
    const city = await r('POST', '/api/panel/push', { ...base, audience: { kind: 'city', city: 'طرابلس' } }, bearer(marketing.token));
    const c1 = city.json?.campaign;
    ok('التسويق يرسل الآن ← 201 «أُرسل»: 2', city.status === 201 && c1?.status === 'sent' && c1?.counts?.sent === 2 && c1?.counts?.skipped === 0, `${city.status} ${JSON.stringify(city.json?.campaign)}`);
    const to1 = sentTo(c1?.id);
    ok('وصل لجهازي طرابلس فقط، لا لمن أطفأ العروض', to1.length === 2 && to1.includes(d.tripoli) && to1.includes(d.cart) && !to1.includes(d.off));
    const m1 = expo.state.messages.find((m) => m.data?.campaignId === c1?.id);
    ok('الرسالة: العنوان والنص والقناة', m1?.title === base.title && m1?.body === base.body && m1?.channelId === 'offers' && m1?.sound === 'default');
    ok('data: { kind, link, campaignId }', m1?.data?.kind === 'offer' && m1?.data?.link === '/p/balance' && m1?.data?.campaignId === c1?.id);
    ok('السجل: من أرسل ومتى', c1?.by?.id === marketing.id && c1?.by?.name === 'التسويق' && Boolean(c1?.sentAt) && c1?.audience?.city === 'طرابلس');

    console.log('\n\x1b[1m5. الحد الأسبوعي، والرمز الميت\x1b[0m');
    ok('حد غير صالح (9) ← 400', (await r('PUT', '/api/panel/push/limit', { perWeek: 9 }, bearer(marketing.token))).status === 400);
    const lim = await r('PUT', '/api/panel/push/limit', { perWeek: 1 }, bearer(marketing.token));
    ok('الحد 1 ← 200، ويُحفظ مع السجل', lim.status === 200 && lim.json?.perWeek === 1 && JSON.parse(fs.readFileSync(pushFile, 'utf8')).perWeek === 1);
    ok('العدّاد: جهازان بلغا الحد', lim.json?.audiences?.offers?.atLimit === 2);
    const all = await r('POST', '/api/panel/push', { ...base, title: 'خصم نهاية الأسبوع' }, bearer(marketing.token));
    const c2 = all.json?.campaign;
    ok('للجميع: 5 في الجمهور، 2 تُخطّيا، 1 تعذّر، 2 وصل', c2?.counts?.audience === 5 && c2?.counts?.skipped === 2 && c2?.counts?.failed === 1 && c2?.counts?.sent === 2, JSON.stringify(c2?.counts));
    const to2 = sentTo(c2?.id);
    ok('لم يصل لمن بلغ الحد', !to2.includes(d.tripoli) && !to2.includes(d.cart) && to2.includes(d.benghazi));
    const after = (await r('GET', '/api/panel/push', null, bearer(marketing.token))).json;
    ok('الرمز الميت حُذف من الأجهزة', after?.audiences?.offers?.devices === 4 && !fs.readFileSync(devicesFile, 'utf8').includes(d.dead));

    console.log('\n\x1b[1m6. إرسال تجريبي لجهازي\x1b[0m');
    const noDevice = await r('POST', '/api/panel/push/test', base, bearer(admin.token));
    ok('المدير بلا جهاز ← 409', noDevice.status === 409 && noDevice.json?.code === 'no_device');
    const before = expo.state.messages.length;
    const test = await r('POST', '/api/panel/push/test', base, bearer(marketing.token));
    ok('التسويق ← 200، تجريبي', test.status === 200 && test.json?.campaign?.test === true && test.json?.campaign?.status === 'sent' && test.json?.campaign?.audience?.kind === 'test');
    const newOnes = expo.state.messages.slice(before);
    ok('وصل لجهازه فقط (والعروض عنده مطفأة)', newOnes.length === 1 && newOnes[0].to === d.mine && newOnes[0].data?.test === true);
    ok('ولا يُحسب في الحد الأسبوعي', test.json?.audiences?.offers?.atLimit === after?.audiences?.offers?.atLimit);

    console.log('\n\x1b[1m7. جمهور السلة\x1b[0m');
    await r('PUT', '/api/panel/push/limit', { perWeek: 3 }, bearer(marketing.token));
    const cart = await r('POST', '/api/panel/push', { ...base, title: 'سلتك بانتظارك', link: '', audience: { kind: 'cart' } }, bearer(marketing.token));
    ok('سلة قبل يوم فقط', cart.status === 201 && JSON.stringify(sentTo(cart.json?.campaign?.id)) === JSON.stringify([d.cart]), JSON.stringify(sentTo(cart.json?.campaign?.id)));
    ok('بلا رابط: data.link فارغ', expo.state.messages.find((m) => m.data?.campaignId === cart.json?.campaign?.id)?.data?.link === '');

    console.log('\n\x1b[1m8. ساعات الهدوء، والإلغاء\x1b[0m');
    const quietAround = quietNow();
    ok('ساعات الهدوء حول الآن', await setQuiet(quietAround));
    const sentBefore = expo.state.messages.length;
    const held = await r('POST', '/api/panel/push', { ...base, title: 'وصلت مراتب كراون' }, bearer(marketing.token));
    const c3 = held.json?.campaign;
    const endsAt = held.json?.quietHours?.endsAt;
    ok('«إرسال» الآن ← مؤجَّل (held)', held.status === 201 && c3?.status === 'held' && held.json?.quietHours?.now === true, `${held.status} ${JSON.stringify(c3)}`);
    ok('حتى نهاية ساعات الهدوء', Boolean(endsAt) && c3?.sendAt === endsAt && new Date(Date.parse(endsAt) + 2 * HOUR).toISOString().slice(11, 16) === quietAround.to, `${c3?.sendAt} ${endsAt}`);
    const sched = await r('POST', '/api/panel/push', { ...base, title: 'مجدول داخل الهدوء', when: 'schedule', at: libyaLocal(10 * 60_000) }, bearer(marketing.token));
    ok('مجدول داخل ساعات الهدوء ← مؤجَّل أيضاً', sched.json?.campaign?.status === 'held' && sched.json?.campaign?.sendAt === endsAt);
    await sleep(1200);
    ok('لم يُرسل شيء', expo.state.messages.length === sentBefore);
    const del = await r('DELETE', `/api/panel/push/${c3?.id}`, null, bearer(marketing.token));
    ok('إلغاء المؤجَّل ← 200 «أُلغي»', del.status === 200 && del.json?.campaign?.status === 'cancelled' && del.json?.campaign?.cancelledBy?.id === marketing.id);
    ok('إلغاؤه مرة ثانية ← 409', (await r('DELETE', `/api/panel/push/${c3?.id}`, null, bearer(marketing.token))).status === 409);
    ok('إلغاء ما أُرسل ← 409', (await r('DELETE', `/api/panel/push/${c1?.id}`, null, bearer(marketing.token))).status === 409);
    ok('إلغاء ما لا يوجد ← 404', (await r('DELETE', '/api/panel/push/0123456789ab', null, bearer(marketing.token))).status === 404);
    ok('خدمة العملاء لا تلغي ← 403', (await r('DELETE', `/api/panel/push/${sched.json?.campaign?.id}`, null, bearer(support.token))).status === 403);
    await r('DELETE', `/api/panel/push/${sched.json?.campaign?.id}`, null, bearer(marketing.token));

    console.log('\n\x1b[1m9. المجدول يرسله المؤقّت مرة واحدة\x1b[0m');
    ok('ساعات الهدوء بعيدة مجدداً', await setQuiet(quietLater()));
    const later = await r('POST', '/api/panel/push', { ...base, title: 'عرض مجدول', link: '/mattresses/elite', when: 'schedule', at: libyaLocal(2000) }, bearer(marketing.token));
    const c4 = later.json?.campaign;
    ok('مجدول ← 201 «مجدول»، لم يُرسل بعد', later.status === 201 && c4?.status === 'scheduled' && sentTo(c4?.id).length === 0, `${later.status} ${JSON.stringify(later.json)?.slice(0, 200)}`);
    let status = null;
    for (let i = 0; i < 30 && status !== 'sent'; i++) {
      await sleep(300);
      status = (await r('GET', '/api/panel/push', null, bearer(marketing.token))).json?.campaigns?.find((x) => x.id === c4?.id)?.status;
    }
    ok('أرسله المؤقّت في موعده', status === 'sent');
    const once = sentTo(c4?.id).length;
    await sleep(1500);
    ok('مرة واحدة لكل جهاز', once > 0 && sentTo(c4?.id).length === once && new Set(sentTo(c4?.id)).size === once, `${once} → ${sentTo(c4?.id).length}`);
    ok('السجل محفوظ في ملف الخادم', JSON.parse(fs.readFileSync(pushFile, 'utf8')).campaigns.some((x) => x.id === c4?.id && x.status === 'sent'));

    console.log('\n\x1b[1m10. «آخر إشعار عرض» في النظرة العامة\x1b[0m');
    const overview = await r('GET', '/api/panel/overview', null, bearer(admin.token));
    ok('آخر حملة أُرسلت (لا التجريبي)', overview.status === 200 && overview.json?.lastPush?.title === 'عرض مجدول' && overview.json?.lastPush?.sent === once, JSON.stringify(overview.json?.lastPush));
    const page = await r('GET', '/admin/push');
    ok('/admin/push ← 200 الواجهة', page.status === 200 && page.text.includes('<div id="root">'), 'status ' + page.status);
  } catch (err) {
    fail++;
    failures.push('استثناء: ' + err.message);
    console.error(err);
    console.error(out.text);
  } finally {
    server.kill();
    for (const f of [settingsFile, pushFile, devicesFile]) fs.rmSync(f, { force: true });
  }
}

/* ------------------------------------------------------------------ 11 */

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
      return error('odoo.exceptions.UserError', `not in the fake: ${model}.${method}`);
    });
  });
  return new Promise((resolve) => server.listen(FAKE_ODOO_PORT, '127.0.0.1', () => resolve({ server, state })));
}

async function odooServer(expo) {
  const ADMIN_PHONE = uniq();
  const settingsFile = tmp('push-odoo-settings') + '.json';
  fs.writeFileSync(settingsFile, '{}\n');
  const pushFile = tmp('push-odoo-log') + '.json';
  const devicesFile = tmp('push-odoo-devices') + '.jsonl';
  const odoo = await fakeOdoo();
  // The settings Odoo holds: quiet hours away from now.
  odoo.state.params['brimatex.app.settings'] = JSON.stringify({ quietHours: quietLater() });
  const { server, out } = await startTestServer({
    port: ODOO_PORT,
    env: {
      ADMIN_PHONES: ADMIN_PHONE,
      BRIMATEX_SETTINGS_FILE: settingsFile,
      BRIMATEX_PUSH_FILE: pushFile,
      BRIMATEX_DEVICES_FILE: devicesFile,
      BRIMATEX_EXPO_PUSH_URL: `http://127.0.0.1:${EXPO_PORT}/--/api/v2/push/send`,
      ODOO_URL: `http://127.0.0.1:${FAKE_ODOO_PORT}`,
      ODOO_DB: 'test',
      ODOO_USERNAME: 'bot@brimatex.ly',
      ODOO_API_KEY: 'test-key',
    },
  });
  const r = (...args) => req(ODOO_PORT, ...args);
  try {
    console.log('\n\x1b[1m11. مع أودو: المعامل brimatex.app.push\x1b[0m');
    const admin = await register(ODOO_PORT, 'المدير', ADMIN_PHONE);
    const token = `ExponentPushToken[odoo-${Date.now()}]`;
    await r('POST', '/api/devices', { token, platform: 'ios', offers: true, city: 'طرابلس' });
    const got = await r('GET', '/api/panel/push', null, bearer(admin.token));
    ok('المخزن: أودو', got.status === 200 && got.json?.storage === 'odoo' && got.json?.audiences?.offers?.devices === 1, `${got.status} ${JSON.stringify(got.json)?.slice(0, 160)}`);
    const sent = await r('POST', '/api/panel/push', { title: 'عرض على ديلوكس', body: 'خصم 15٪ حتى نهاية الشهر.', link: '/offers', audience: { kind: 'offers' } }, bearer(admin.token));
    const param = JSON.parse(odoo.state.params['brimatex.app.push'] || '{}');
    ok('الإرسال ← 201، والسجل في المعامل JSON', sent.status === 201 && param.campaigns?.[0]?.id === sent.json?.campaign?.id && param.campaigns?.[0]?.status === 'sent' && param.perWeek === 2, `${sent.status} ${JSON.stringify(sent.json)?.slice(0, 200)}`);
    ok('ولا ملف محلي', !fs.existsSync(pushFile));

    odoo.state.deny = true;
    const before = expo.state.messages.length;
    const denied = await r('POST', '/api/panel/push', { title: 'عرض ثانٍ', body: 'نص', audience: { kind: 'offers' } }, bearer(admin.token));
    ok('أودو يرفض ← 503 برسالة الصلاحية', denied.status === 503 && denied.json?.error === 'تعذّر الحفظ في أودو: حساب الربط يحتاج صلاحية الإعدادات', `${denied.status} ${JSON.stringify(denied.json)}`);
    ok('ولم يُرسل شيء', expo.state.messages.length === before);
    await r('POST', '/api/devices', { token: `ExponentPushToken[odoo-admin-${Date.now()}]`, platform: 'android' }, bearer(admin.token));
    const testDenied = await r('POST', '/api/panel/push/test', { title: 'عرض', body: 'نص' }, bearer(admin.token));
    ok('التجريبي أيضاً ← 503 بلا إرسال', testDenied.status === 503 && expo.state.messages.length === before, `${testDenied.status}`);
  } catch (err) {
    fail++;
    failures.push('استثناء: ' + err.message);
    console.error(err);
    console.error(out.text);
  } finally {
    server.kill();
    odoo.server.close();
    for (const f of [settingsFile, pushFile, devicesFile]) fs.rmSync(f, { force: true });
  }
}

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — الإشعارات في اللوحة ═══\x1b[0m');
  unit();
  const expo = await fakeExpo();
  await localServer(expo);
  await odooServer(expo);
  expo.server.close();

  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
  if (fail) {
    console.log('\x1b[31m' + failures.map((f) => '  - ' + f).join('\n') + '\x1b[0m');
    process.exit(1);
  }
  process.exit(0);
}

run();
