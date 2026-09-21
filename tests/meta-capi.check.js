#!/usr/bin/env node
// Meta Conversions API - src/lib/meta-capi.js and its hook in routes/orders.js.
//
// 1. The Purchase payload, built directly: Meta's normalisation and hashing
//    rules, the event ID the browser shares, USD conversion, and that no raw
//    phone number ever leaves the server.
// 2. End to end: a hermetic server reports to a local mock of graph.facebook.com
//    (FACEBOOK_GRAPH_URL), so nothing reaches the real Meta.
//    - a website order (with `tracking`) is reported once, token in the body
//    - an app order (no `tracking`) is not reported
//    - Meta rejecting the event does not fail the order
//
// Runs with the rest: npm test

'use strict';

const crypto = require('crypto');
const http = require('http');
const { startTestServer } = require('./_server');

const PORT = process.env.TEST_PORT || 3196;
const MOCK_PORT = 3197;
const PIXEL = '28114121984867434';
const TOKEN = 'test-token-not-real';
const uniq = () => '09' + Math.floor(10000000 + Math.random() * 89999999);
const ADMIN_PHONE = uniq();
const sha = (v) => crypto.createHash('sha256').update(v, 'utf8').digest('hex');

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
const section = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: {
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            /* not JSON */
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

/* ---------------------------------------------------------------- mock Meta */

const received = [];
let mockStatus = 200;
const mock = http.createServer((r, res) => {
  let text = '';
  r.on('data', (c) => (text += c));
  r.on('end', () => {
    received.push({ url: r.url, body: JSON.parse(text || '{}') });
    res.writeHead(mockStatus, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        mockStatus === 200 ? { events_received: 1 } : { error: { message: 'Invalid parameter (mock)' } }
      )
    );
  });
});

async function main() {
  /* ------------------------------------------------------------ 1. payload */
  section('1. محتوى حدث الشراء');
  process.env.FACEBOOK_CAPI_TOKEN = '';
  const capi = require('../src/lib/meta-capi');
  const fakeReq = {
    headers: {
      'x-forwarded-for': '41.208.1.1, 10.0.0.1',
      'user-agent': 'Mozilla/5.0 test',
      cookie: '_fbp=fb.1.1700000000000.111; other=x',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const ev = capi.buildPurchase({
    req: fakeReq,
    orderName: 'S00042',
    customer: { name: 'محمد  علي بن سالم', phone: '091-234-5678', city: 'طرابلس', email: ' A@B.ly ' },
    items: [{ productId: 7747, quantity: 2 }],
    total: 106,
    userId: null,
    lydPerUsd: 8,
    prices: new Map([[7747, 53]]),
    tracking: { eventSourceUrl: 'https://brimatex.ly/cart', fbc: 'fb.1.1700000000000.CLICK' },
  });
  const ud = ev.user_data;
  ok('event_id يطابق المتصفح', ev.event_id === 'purchase-S00042', ev.event_id);
  ok('action_source = website', ev.action_source === 'website');
  ok('الهاتف: 218 بدون الصفر ثم مشفّر', ud.ph[0] === sha('218912345678'), ud.ph[0]);
  ok('الدولة ly مشفّرة', ud.country === sha('ly'));
  ok('الاسم الأول والأخير مشفّران', ud.fn === sha('محمد') && ud.ln === sha('سالم'));
  ok('المدينة مشفّرة', ud.ct === sha('طرابلس'));
  ok('البريد: صغير ومقصوص ثم مشفّر', ud.em[0] === sha('a@b.ly'));
  ok('external_id = الهاتف المشفّر للزائر', ud.external_id[0] === sha('218912345678'));
  ok('IP الحقيقي من أول قفزة', ud.client_ip_address === '41.208.1.1', ud.client_ip_address);
  ok('fbp من الكوكي', ud.fbp === 'fb.1.1700000000000.111');
  ok('fbc من المتصفح عند غياب الكوكي', ud.fbc === 'fb.1.1700000000000.CLICK');
  ok('القيمة بالدولار: 106 ÷ 8', ev.custom_data.value === 13.25 && ev.custom_data.currency === 'USD');
  ok('سعر القطعة بالدولار', ev.custom_data.contents[0].item_price === 6.63);
  ok('content_ids نصوص', ev.custom_data.content_ids[0] === '7747');
  const raw = JSON.stringify(ev);
  ok('لا رقم هاتف خام في الحدث', !/0912345678|218912345678|091-234/.test(raw));
  ok('لا اسم خام في الحدث', !raw.includes('محمد'));

  /* ----------------------------------------------------------- 2. end to end */
  await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));
  const { server } = await startTestServer({
    port: PORT,
    env: {
      ADMIN_PHONES: ADMIN_PHONE,
      FACEBOOK_CAPI_TOKEN: TOKEN,
      FACEBOOK_GRAPH_URL: `http://127.0.0.1:${MOCK_PORT}`,
    },
  });

  try {
    const reg = await req('POST', '/api/auth/register', { name: 'Admin', phone: ADMIN_PHONE, password: 'secret1' });
    const auth = { Authorization: 'Bearer ' + reg.json.token };
    await req('PUT', '/api/admin/settings/facebook-pixel', { pixelId: PIXEL, lydPerUsd: '8' }, auth);
    const products = (await req('GET', '/api/products')).json.products;
    const product = products[0];
    const customer = { name: 'زبون تجربة', phone: uniq(), city: 'طرابلس', address: 'شارع التجربة' };
    const items = [{ productId: product.id, quantity: 1 }];

    section('2. طلب من الموقع');
    const web = await req(
      'POST',
      '/api/orders',
      { customer, items, note: '', tracking: { eventSourceUrl: 'https://brimatex.ly/cart', fbp: 'fb.1.1.222' } },
      { 'User-Agent': 'Mozilla/5.0 web', Cookie: '_fbc=fb.1.1.CLICKCOOKIE' }
    );
    ok('الطلب ينجح (201)', web.status === 201, 'status ' + web.status);
    await wait(500);
    ok('وصل حدث واحد إلى ميتا', received.length === 1, 'received ' + received.length);
    const hit = received[0] || { body: {}, url: '' };
    const e = (hit.body.data || [])[0] || {};
    ok('إلى مجموعة البيانات الصحيحة، أحدث إصدار', hit.url === `/v26.0/${PIXEL}/events`, hit.url);
    ok('المفتاح في جسم الطلب لا في الرابط', hit.body.access_token === TOKEN && !hit.url.includes('token'));
    ok('event_id = purchase-<رقم الطلب>', e.event_id === `purchase-${web.json.orderName}`, e.event_id);
    ok('القيمة محوّلة للدولار', e.custom_data?.currency === 'USD' && e.custom_data?.value === Math.round((product.price / 8) * 100) / 100, JSON.stringify(e.custom_data));
    ok('fbc من الكوكي', e.user_data?.fbc === 'fb.1.1.CLICKCOOKIE');
    ok('User-Agent الزبون', e.user_data?.client_user_agent === 'Mozilla/5.0 web');

    const st = await req('GET', '/api/admin/settings/facebook-pixel', null, auth);
    ok('لوحة الإدارة: مفعّل وآخر إرسال ناجح', st.json?.conversionsApi?.configured && st.json.conversionsApi.lastResult?.ok === true, JSON.stringify(st.json?.conversionsApi));
    ok('المفتاح لا يظهر في لوحة الإدارة', !JSON.stringify(st.json).includes(TOKEN));

    section('3. طلب من التطبيق (بدون tracking)');
    const app = await req('POST', '/api/orders', { customer: { ...customer, phone: uniq() }, items, note: '' });
    ok('الطلب ينجح (201)', app.status === 201, 'status ' + app.status);
    await wait(500);
    ok('لا يُرسل لميتا', received.length === 1, 'received ' + received.length);

    section('4. ميتا ترفض الحدث');
    mockStatus = 400;
    const rejected = await req('POST', '/api/orders', {
      customer: { ...customer, phone: uniq() },
      items,
      note: '',
      tracking: { eventSourceUrl: 'https://brimatex.ly/cart' },
    });
    ok('الطلب ينجح رغم الرفض (201)', rejected.status === 201, 'status ' + rejected.status);
    await wait(500);
    const st2 = await req('GET', '/api/admin/settings/facebook-pixel', null, auth);
    ok('الرفض ظاهر في لوحة الإدارة', st2.json?.conversionsApi?.lastResult?.ok === false && /Invalid parameter/.test(st2.json.conversionsApi.lastResult.error || ''), JSON.stringify(st2.json?.conversionsApi?.lastResult));

    await req('DELETE', '/api/admin/settings/facebook-pixel', null, auth);
  } finally {
    server.kill();
    mock.close();
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` + (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : ''));
  for (const f of failures) console.log('  • ' + f);
  console.log('────────────────────────────────────────────────────');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
