#!/usr/bin/env node
// Loyalty - src/lib/perks.js, its routes (routes/user.js) and the voucher in
// POST /api/orders (routes/orders.js), plus the discount line in Odoo.
//
// 1. Odoo, against a local JSON-RPC mock: a voucher becomes one negative line
//    in the same sale.order create call, on a "voucher discount" service
//    product that is created once and then reused, with no taxes.
// 2. End to end on a hermetic server (file store, demo orders):
//    - points come from paid orders only; unpaid ones are "pending"
//    - redemption in whole steps, within the balance - and five at once
//      cannot overspend it
//    - reward vouchers unlock from orders/reviews; one use each; another
//      customer's code is refused; a guest cannot use one
//    - two orders racing for one voucher: exactly one gets it
//    - reviews: own orders only, one per product per order
//
// Runs with the rest: npm test

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { startTestServer } = require('./_server');

// Ports no other test uses: smoke.test.js takes 3199 right after this one,
// and a mock still closing there made it refuse to start.
const PORT = process.env.TEST_PORT || 3188;
const ODOO_PORT = 3189;
const uniq = () => '09' + Math.floor(10000000 + Math.random() * 89999999);
const ADMIN_PHONE = uniq();

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

/* ─────────────────────────── 1. Odoo discount line ─────────────────────────── */

async function odooPart() {
  section('1. سطر الخصم في أودو');
  const calls = [];
  let productCreates = 0;
  const odoo = http.createServer((r, res) => {
    let text = '';
    r.on('data', (c) => (text += c));
    r.on('end', () => {
      const { params, id } = JSON.parse(text);
      let result = null;
      if (params.service === 'common') result = 7; // authenticate -> uid
      else {
        const [, , , model, method, args] = params.args;
        calls.push({ model, method, args });
        if (model === 'res.partner' && method === 'search') result = [];
        else if (model === 'res.partner' && method === 'create') result = 55;
        else if (model === 'product.product' && method === 'search') result = productCreates ? [9001] : [];
        else if (model === 'product.product' && method === 'create') (productCreates++, (result = 9001));
        else if (model === 'sale.order' && method === 'create') result = 800;
        else if (model === 'sale.order' && method === 'read') result = [{ id: 800, name: 'S00800', amount_total: 1757.5 }];
        else result = [];
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
  });
  await new Promise((r) => odoo.listen(ODOO_PORT, '127.0.0.1', r));

  // odoo.js caches the uid in the settings file - snapshot it, restore it after,
  // so the mock's address never reaches the servers started later.
  const settingsFile = path.join(__dirname, '..', 'src', 'data', 'settings.local.json');
  const before = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile) : null;

  process.env.DATABASE_URL = '';
  process.env.ODOO_URL = `http://127.0.0.1:${ODOO_PORT}`;
  process.env.ODOO_DB = 'test';
  process.env.ODOO_USERNAME = 'test';
  process.env.ODOO_API_KEY = 'test';
  const odooLib = require(path.join(__dirname, '..', 'src', 'lib', 'odoo'));

  try {
    const customer = { name: 'زبون', phone: '0912345678', city: 'طرابلس', address: 'شارع' };
    const items = [{ productId: 7747, quantity: 2 }];
    const result = await odooLib.createSaleOrder(customer, items, 'ملاحظة', { amount: 92.5, label: 'قسيمة BRX-FIRST-5 — خصم 5%' });
    const creates = calls.filter((c) => c.model === 'sale.order' && c.method === 'create');
    const lines = creates[0]?.args[0]?.order_line || [];
    const discountLine = lines.find((l) => l[2].price_unit < 0)?.[2];
    ok('طلب واحد فقط يُنشأ', creates.length === 1, 'creates ' + creates.length);
    ok('سطر المنتج + سطر الخصم في نفس الطلب', lines.length === 2, JSON.stringify(lines));
    ok('سطر الخصم بالسالب', discountLine?.price_unit === -92.5);
    ok('على منتج الخصم', discountLine?.product_id === 9001);
    ok('بدون ضرائب (tax_ids فارغ)', JSON.stringify(discountLine?.tax_ids) === '[[6,0,[]]]');
    ok('اسم السطر يذكر القسيمة', /BRX-FIRST-5/.test(discountLine?.name || ''));
    ok('الإجمالي من أودو', result.total === 1757.5);

    const created = calls.find((c) => c.model === 'product.product' && c.method === 'create')?.args[0];
    ok('منتج الخصم: خدمة، لا يُشترى، بلا ضرائب', created?.type === 'service' && created?.purchase_ok === false && created?.default_code === 'BRX-DISCOUNT');

    await odooLib.createSaleOrder(customer, items, '', { amount: 5, label: 'x' });
    ok('منتج الخصم يُنشأ مرة واحدة فقط', productCreates === 1, 'creates ' + productCreates);

    calls.length = 0;
    await odooLib.createSaleOrder(customer, items, '', null);
    const plain = calls.find((c) => c.model === 'sale.order' && c.method === 'create')?.args[0]?.order_line || [];
    ok('بدون قسيمة: لا سطر خصم', plain.length === 1);
  } finally {
    odoo.closeAllConnections();
    odoo.close();
    if (before) fs.writeFileSync(settingsFile, before);
    else fs.rmSync(settingsFile, { force: true });
  }
}

/* ─────────────────────────── 2. End to end ─────────────────────────── */

async function serverPart() {
  const { server } = await startTestServer({ port: PORT, env: { ADMIN_PHONES: ADMIN_PHONE } });
  try {
    const register = async (phone) =>
      (await req('POST', '/api/auth/register', { name: 'زبون تجربة', phone, password: 'secret1' })).json.token;
    const admin = await register(ADMIN_PHONE);
    const alice = await register(uniq());
    const bob = await register(uniq());
    const products = (await req('GET', '/api/products')).json.products;
    const p = products[0];
    const customer = { name: 'زبون تجربة', phone: uniq(), city: 'طرابلس', address: 'شارع التجربة' };
    const place = (token, extra = {}, qty = 1) =>
      req('POST', '/api/orders', { customer, items: [{ productId: p.id, quantity: qty }], note: '', channel: 'web', ...extra }, token);
    const pay = (name) => req('PATCH', `/api/admin/orders/${encodeURIComponent(name)}`, { paymentStatus: 'paid' }, admin);

    section('2. الوصول');
    ok('بدون جلسة: 401', (await req('GET', '/api/user/perks')).status === 401);
    const empty = (await req('GET', '/api/user/perks', null, alice)).json;
    ok('زبون جديد: رصيد 0 وبلا قسائم', empty.points.balance === 0 && empty.vouchers.length === 0, JSON.stringify(empty.points));

    section('3. النقاط');
    const o1 = (await place(alice, {}, 1)).json;
    let s = (await req('GET', '/api/user/perks', null, alice)).json;
    ok('طلب غير مدفوع: نقاط معلّقة لا رصيد', s.points.pending === Math.floor(p.price) && s.points.balance === 0, JSON.stringify(s.points));
    ok('أول طلب يفتح قسيمة BRX-FIRST-5', s.vouchers.some((v) => v.code === 'BRX-FIRST-5' && v.state === 'active'));
    ok('newlyUnlocked يذكرها مرة واحدة', s.newlyUnlocked.includes('first'));
    s = (await req('GET', '/api/user/perks', null, alice)).json;
    ok('ولا تُعاد في المرة الثانية', !s.newlyUnlocked.includes('first'));

    // Enough paid orders for exactly two redemption steps.
    const needed = 2 * 250;
    const qty = Math.ceil(needed / p.price);
    const o2 = (await place(alice, {}, qty)).json;
    ok('الأدمن يعلّم الطلبين مدفوعين', (await pay(o1.orderName)).status === 200 && (await pay(o2.orderName)).status === 200);
    s = (await req('GET', '/api/user/perks', null, alice)).json;
    const earned = Math.floor(o1.total) + Math.floor(o2.total);
    ok('الرصيد = مجموع الطلبات المدفوعة', s.points.balance === earned && s.points.pending === 0, JSON.stringify(s.points));
    ok('/api/user/points بنفس الأرقام', (await req('GET', '/api/user/points', null, alice)).json.balance === earned);

    section('4. الاستبدال');
    ok('أقل من 250: مرفوض', (await req('POST', '/api/user/points/redeem', { points: 100 }, alice)).status === 400);
    const steps = Math.floor(earned / 250);
    // Three more one-step redemptions than the balance holds, all at once:
    // exactly as many as it holds may pass, the rest must be refused.
    const burst = await Promise.all(
      Array.from({ length: steps + 3 }, () => req('POST', '/api/user/points/redeem', { points: 250 }, alice))
    );
    const passed = burst.filter((r) => r.status === 201);
    ok(`${steps + 3} طلب استبدال متزامن والرصيد يكفي ${steps}: ينجح ${steps} بالضبط`, passed.length === steps && burst.filter((r) => r.status === 400).length === 3, burst.map((r) => r.status).join(','));
    const pv = passed[0]?.json.voucher;
    ok('قسيمة الاستبدال: 5 د.ل وصالحة 90 يوماً', pv?.unit === 'د.ل' && pv?.discount === 5 && Math.round((new Date(pv.validUntil) - new Date(pv.unlockedAt)) / 86400000) === 90, JSON.stringify(pv));
    s = (await req('GET', '/api/user/perks', null, alice)).json;
    ok('الرصيد = الباقي بعد الاستبدال، لا بالسالب', s.points.balance === earned - steps * 250 && s.points.balance < 250, String(s.points.balance));
    ok('السجل فيه الكسب والاستبدال', s.points.ledger.some((l) => l.points < 0) && s.points.ledger.some((l) => l.points > 0));

    section('5. القسائم في الطلب');
    ok('ضيف يستعمل قسيمة: 401', (await place(null, { voucherCode: 'BRX-FIRST-5' })).status === 401);
    ok('قسيمة زبون آخر: مرفوضة', (await place(bob, { voucherCode: 'BRX-FIRST-5' })).status === 400);
    const withV = await place(alice, { voucherCode: 'brx-first-5' });
    const expected = Math.round(p.price * 0.05 * 100) / 100;
    ok('الطلب بالقسيمة ينجح (201)', withV.status === 201, 'status ' + withV.status);
    ok('خصم 5% من المجموع', withV.json?.discount === expected, `${withV.json?.discount} vs ${expected}`);
    ok('الإجمالي بعد الخصم', Math.abs(withV.json?.total - (p.price - expected)) < 0.01, String(withV.json?.total));
    ok('القسيمة صارت مستعملة', (await req('GET', '/api/user/vouchers', null, alice)).json.vouchers.find((v) => v.code === 'BRX-FIRST-5')?.state === 'used');
    ok('مرة ثانية: مرفوضة', (await place(alice, { voucherCode: 'BRX-FIRST-5' })).status === 400);

    // Points voucher: fixed dinars, and two orders racing for it.
    const race = await Promise.all([place(alice, { voucherCode: pv.code }), place(alice, { voucherCode: pv.code })]);
    const won = race.filter((r) => r.status === 201);
    ok('طلبان متزامنان بنفس القسيمة: واحد فقط ينجح', won.length === 1, race.map((r) => r.status).join(','));
    ok('قسيمة النقاط: خصم 5 د.ل ثابت', won[0]?.json.discount === 5);

    section('6. التقييمات');
    const myOrder = o1.orderName;
    ok('تقييم طلب لا يخصّه: مرفوض', (await req('POST', '/api/user/reviews', { productId: p.id, orderName: myOrder, rating: 5 }, bob)).status === 400);
    ok('تقييم 6 نجوم: مرفوض', (await req('POST', '/api/user/reviews', { productId: p.id, orderName: myOrder, rating: 6 }, alice)).status === 400);
    const review = await req('POST', '/api/user/reviews', { productId: p.id, orderName: myOrder, rating: 5, comment: 'ممتازة' }, alice);
    ok('تقييم طلبه: 201', review.status === 201);
    ok('نفس المنتج في نفس الطلب مرة ثانية: مرفوض', (await req('POST', '/api/user/reviews', { productId: p.id, orderName: myOrder, rating: 4 }, alice)).status === 400);
    ok('GET يرجّع التقييم', (await req('GET', '/api/user/reviews', null, alice)).json.reviews.length === 1);
    s = (await req('GET', '/api/user/perks', null, alice)).json;
    ok('التقييم يفتح قسيمة BRX-REVIEWER-5', s.vouchers.some((v) => v.code === 'BRX-REVIEWER-5'));
  } finally {
    server.kill();
  }
}

(async () => {
  try {
    await odooPart();
    await serverPart();
  } catch (err) {
    console.error(err);
    fail++;
  }
  console.log('\n────────────────────────────────────────────────────');
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` + (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : ''));
  for (const f of failures) console.log('  • ' + f);
  console.log('────────────────────────────────────────────────────');
  process.exit(fail ? 1 : 0);
})();
