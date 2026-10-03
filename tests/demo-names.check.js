#!/usr/bin/env node
// Demo orders' numbers (src/routes/orders.js, nextDemoNumber).
//
// Born out of a CI failure: two app orders were placed in one millisecond,
// both got DEMO-750899, and the panel showed the Android order under the
// other's name - its delivery and payment gone. The server here runs with a
// frozen clock (tests/_frozen-clock.js), so every order lands in the same
// millisecond and two of them sharing a number would show every time.
//
// Hermetic environment: no Postgres, no Odoo - demo orders in the file store.
//
// Runs with the rest: npm test

'use strict';

const http = require('http');
const path = require('path');
const { startTestServer } = require('./_server');

const PORT = process.env.TEST_PORT || 3281;
const CITY = 'مدينة-' + Math.random().toString(36).slice(2, 8);

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

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: encodeURI(urlPath),
        method,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
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

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — أرقام الطلبات التجريبية ═══\x1b[0m');

  const preload = path.join(__dirname, '_frozen-clock.js').replace(/\\/g, '/');
  const { server } = await startTestServer({
    port: PORT,
    env: {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require "${preload}"`.trim(),
      RATE_LIMIT_ORDERS_PER_MIN: '200',
    },
  });

  try {
    const products = await req('GET', '/api/products');
    const product = (products.json?.products || []).find((p) => p.enabled !== false);
    const order = (name, extra) => ({
      customer: { name, phone: '0912345678', city: CITY, address: 'شارع الاختبار' },
      items: [{ productId: product.id, quantity: 1 }],
      ...extra,
    });

    // One after another, as the panel test places them.
    const app = await req('POST', '/api/orders', order('زبون التطبيق', { channel: 'app', requestId: 'req_names_1_' + process.pid }));
    const android = await req('POST', '/api/orders', order('زبون أندرويد', { channel: 'app', requestId: 'req_names_2_' + process.pid }));
    ok('طلبان في جزء الثانية نفسه', app.status === 201 && android.status === 201, `${app.status},${android.status}`);
    ok('برقمين مختلفين', app.json?.orderName !== android.json?.orderName, `${app.json?.orderName} / ${android.json?.orderName}`);
    ok('وفاتورتين مختلفتين', app.json?.invoiceName !== android.json?.invoiceName);
    ok('الرقم بالشكل المعهود', /^DEMO-\d{6}$/.test(app.json?.orderName || '') && /^INV-\d{6}$/.test(app.json?.invoiceName || ''), app.json?.orderName);

    // Several at once.
    const burst = await Promise.all(
      Array.from({ length: 6 }, (_, i) => req('POST', '/api/orders', order('زبون ' + i, { channel: 'web' })))
    );
    const names = [app, android, ...burst].map((r) => r.json?.orderName);
    ok('ستة طلبات معاً: كلها مقبولة', burst.every((r) => r.status === 201), burst.map((r) => r.status).join());
    ok('ولا رقمان متشابهان', new Set(names).size === names.length, names.join(' '));
  } finally {
    server.kill();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mالنتيجة:\x1b[0m ${fail ? `\x1b[31m${fail} فاشل\x1b[0m / ` : ''}\x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
  if (failures.length) for (const f of failures) console.log('  - ' + f);
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
