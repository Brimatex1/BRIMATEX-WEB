#!/usr/bin/env node
// The classic dashboard's order status (PATCH /api/admin/orders/:name,
// src/routes/admin.js) reaches Odoo.
//
// What it guards: «مؤكد» and «ملغى» on an order that lives in Odoo run Odoo's
// own confirmation and cancellation first - they used to change the
// dashboard's copy only, so Odoo never knew. Odoo refusing (on its way,
// already cancelled, offline) leaves the order as it was and says why. An
// order with no Odoo record, «تم التسليم» and the payment status stay local.
//
// In-process: Odoo, the orders store and push are fakes (require.cache), so
// nothing leaves this machine and no data file is touched. Runs with the rest:
// npm test
'use strict';

const path = require('path');
const { Readable } = require('stream');

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// ---- fakes, in place before admin.js loads them ----
const calls = [];
let odooRefuses = null; // { code, message } for the next Odoo call
let odooOnline = true;
const fakeOdoo = {
  isConfigured: () => odooOnline,
  webUrl: () => null,
  async confirmSaleOrder(id) {
    calls.push({ fn: 'confirm', id });
    if (odooRefuses) throw Object.assign(new Error(odooRefuses.message), { code: odooRefuses.code });
    return { confirmed: true };
  },
  async cancelSaleOrder(id, reason, opts) {
    calls.push({ fn: 'cancel', id, reason, by: opts?.by });
    if (odooRefuses) throw Object.assign(new Error(odooRefuses.message), { code: odooRefuses.code });
    return { cancelled: true };
  },
};
const store = new Map();
const fakeOrders = {
  async getOrderByName(name) {
    return store.has(name) ? { ...store.get(name) } : null;
  },
  async updateOrder(name, updates) {
    if (!store.has(name)) return null;
    store.set(name, { ...store.get(name), ...updates });
    return { ...store.get(name) };
  },
};
const fake = (rel, exports) => {
  const file = path.resolve(__dirname, '..', 'src', 'lib', rel);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
fake('odoo.js', fakeOdoo);
fake('orders.js', fakeOrders);
fake('push.js', { notifyOrderStage: async () => {} });

const { createAdminRoutes } = require('../src/routes/admin');
const admin = { id: 'u-admin', name: 'محمد', role: 'admin' };
const handle = createAdminRoutes({ requireAdmin: async () => admin, deleteUploadedFile: () => {} });

/** One PATCH through the route, as the dashboard sends it. */
function patch(name, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'PATCH';
  req.url = `/api/admin/orders/${encodeURIComponent(name)}`;
  req.headers = { 'content-type': 'application/json' };
  return new Promise((resolve) => {
    const res = {
      req,
      statusCode: 200,
      headers: {},
      writeHead(status, headers) {
        this.statusCode = status;
        Object.assign(this.headers, headers || {});
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(chunk) {
        let json = null;
        try {
          json = JSON.parse(String(chunk || ''));
        } catch {
          /* empty */
        }
        resolve({ status: this.statusCode, json });
      },
    };
    handle(req, res, new URL(`http://x${req.url}`));
  });
}

const seed = () => {
  store.clear();
  store.set('S00101', { orderName: 'S00101', odooOrderId: 101, invoiceStatus: 'draft', paymentStatus: 'unpaid' });
  store.set('S00102', { orderName: 'S00102', odooOrderId: 102, invoiceStatus: 'confirmed', paymentStatus: 'unpaid' });
  store.set('DEMO-1', { orderName: 'DEMO-1', invoiceStatus: 'draft', paymentStatus: 'unpaid' });
  calls.length = 0;
  odooRefuses = null;
  odooOnline = true;
};

(async () => {
  console.log('\n\x1b[1m1. «مؤكد» يمرّ بأودو\x1b[0m');
  seed();
  let r = await patch('S00101', { invoiceStatus: 'confirmed' });
  ok('200', r.status === 200, JSON.stringify(r.json));
  ok('أودو أكّد الطلب 101', calls.length === 1 && calls[0].fn === 'confirm' && calls[0].id === 101);
  ok('ونسخة الموقع صارت مؤكدة', store.get('S00101').invoiceStatus === 'confirmed');

  console.log('\n\x1b[1m2. «ملغى» يمرّ بأودو، باسم من ألغاه\x1b[0m');
  seed();
  r = await patch('S00102', { invoiceStatus: 'cancelled' });
  ok('200', r.status === 200, JSON.stringify(r.json));
  ok('أودو ألغى الطلب 102 باسم المدير', calls.length === 1 && calls[0].fn === 'cancel' && calls[0].id === 102 && calls[0].by === 'محمد');
  ok('ونسخة الموقع صارت ملغاة', store.get('S00102').invoiceStatus === 'cancelled');

  console.log('\n\x1b[1m3. أودو يرفض\x1b[0m');
  seed();
  odooRefuses = { code: 'shipped', message: 'خرج الطلب للتوصيل، ولا يمكن إلغاؤه' };
  r = await patch('S00102', { invoiceStatus: 'cancelled' });
  ok('خرج للتوصيل ← 409 بالسبب', r.status === 409 && r.json?.error === 'خرج الطلب للتوصيل، ولا يمكن إلغاؤه', JSON.stringify(r.json));
  ok('والطلب كما كان', store.get('S00102').invoiceStatus === 'confirmed');
  seed();
  odooRefuses = { code: 'cancelled', message: 'الطلب ملغى في أودو' };
  r = await patch('S00101', { invoiceStatus: 'confirmed' });
  ok('ملغى في أودو ← 409، ولا يتأكد', r.status === 409 && store.get('S00101').invoiceStatus === 'draft');
  seed();
  odooRefuses = { code: undefined, message: 'Odoo Server Error' };
  r = await patch('S00101', { invoiceStatus: 'confirmed' });
  ok('خطأ في أودو ← 502، والطلب كما كان', r.status === 502 && store.get('S00101').invoiceStatus === 'draft');
  seed();
  odooOnline = false;
  r = await patch('S00101', { invoiceStatus: 'cancelled' });
  ok('أودو غير متصل ← 503، ولا شيء يتغير', r.status === 503 && calls.length === 0 && store.get('S00101').invoiceStatus === 'draft');

  console.log('\n\x1b[1m4. ما يبقى في الموقع وحده\x1b[0m');
  seed();
  r = await patch('DEMO-1', { invoiceStatus: 'cancelled' });
  ok('طلب بلا أودو ← يتغير هنا فقط', r.status === 200 && calls.length === 0 && store.get('DEMO-1').invoiceStatus === 'cancelled');
  seed();
  r = await patch('S00102', { invoiceStatus: 'delivered' });
  ok('«تم التسليم» ← بلا أودو كما كان', r.status === 200 && calls.length === 0 && store.get('S00102').invoiceStatus === 'delivered');
  seed();
  r = await patch('S00101', { paymentStatus: 'paid' });
  ok('حالة الدفع ← بلا أودو كما كانت', r.status === 200 && calls.length === 0 && store.get('S00101').paymentStatus === 'paid');
  seed();
  r = await patch('S09999', { invoiceStatus: 'confirmed' });
  ok('طلب غير موجود ← 404، بلا أودو', r.status === 404 && calls.length === 0);

  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` + (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : ''));
  failures.forEach((f) => console.log('  • ' + f));
  console.log('─'.repeat(52) + '\n');
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
