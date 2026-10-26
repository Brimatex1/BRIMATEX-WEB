#!/usr/bin/env node
// The ad behind a website order, on the order in Odoo - src/lib/odoo.js
// createSaleOrder (options.ad) and src/lib/adOrigin.js.
//
// What it guards: an order that came from an ad carries Odoo's own campaign
// and medium (utm.campaign, utm.medium), found by name or created once, while
// the source stays E-COMMERCE (the team's filters and the ECOM journal rule
// read it). An order from no ad carries neither, and Odoo refusing a campaign
// never stops the order.
//
// In-process, against a fake Odoo (lib/http.postJson stubbed): nothing leaves
// the machine. Runs with the rest: npm test
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Before odoo.js reads its settings: its own file, the environment's fake Odoo only.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brx-ad-'));
process.env.BRIMATEX_SETTINGS_FILE = path.join(tmp, 'settings.json');
process.env.ODOO_IGNORE_STORED = '1';
process.env.ODOO_URL = 'http://odoo.test';
process.env.ODOO_DB = 'test';
process.env.ODOO_USERNAME = 'test';
process.env.ODOO_API_KEY = 'test-key-not-real';

const http = require('../src/lib/http');

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

// The fake Odoo: every execute_kw is recorded; names found or created per model.
let calls = [];
let nextId = 500;
let refuseCampaigns = false;
const existing = { 'utm.medium': { facebook: 55 }, 'utm.source': { 'e-commerce': 9 }, 'crm.tag': { 'e-commerce': 8 }, 'res.partner.category': { 'e-commerce': 7 } };
http.postJson = async (url, payload) => {
  const p = payload.params;
  if (p.service === 'common') return { result: 7 };
  const [, , , model, method, args] = p.args;
  calls.push({ model, method, args });
  if (method === 'search') {
    const leaf = args[0][0] || [];
    const name = String(leaf[2] || '').toLowerCase();
    const id = existing[model]?.[name];
    return { result: id ? [id] : [] };
  }
  if (method === 'create') {
    if (model === 'utm.campaign' && refuseCampaigns) return { error: { message: 'Access Denied', data: { name: 'odoo.exceptions.AccessError' } } };
    return { result: nextId++ };
  }
  if (method === 'read' && model === 'sale.order') return { result: [{ id: args[0][0], name: 'S09999', amount_total: 1900 }] };
  if (method === 'search_read' || method === 'read') return { result: [] };
  return { result: true };
};

const odoo = require('../src/lib/odoo');
const customer = { name: 'زبون تجربة', phone: '0910000001', city: 'طرابلس', address: 'شارع' };
const items = [{ productId: 8024, quantity: 1, price: 1900 }];
const orderPayload = () => calls.find((c) => c.model === 'sale.order' && c.method === 'create')?.args[0];

(async () => {
  console.log('\n\x1b[1m1. طلب من إعلان بوسوم utm\x1b[0m');
  calls = [];
  await odoo.createSaleOrder(customer, items, '', null, { ad: { source: 'facebook', medium: 'paid', campaign: 'A | Prospecting', fromAd: true } });
  let order = orderPayload();
  ok('أُنشئت الحملة باسمها (title)', calls.some((c) => c.model === 'utm.campaign' && c.method === 'create' && c.args[0].title === 'A | Prospecting'));
  ok('الطلب عليه الحملة', Number.isInteger(order?.campaign_id), JSON.stringify(order));
  ok('والوسيط من utm_medium (أُنشئ «paid»)', calls.some((c) => c.model === 'utm.medium' && c.method === 'create' && c.args[0].name === 'paid') && Number.isInteger(order?.medium_id));
  ok('والمصدر يبقى E-COMMERCE', order?.source_id === 9);

  console.log('\n\x1b[1m2. الحملة نفسها مرة ثانية\x1b[0m');
  calls = [];
  await odoo.createSaleOrder(customer, items, '', null, { ad: { campaign: 'A | Prospecting', fromAd: true } });
  order = orderPayload();
  ok('لا تُنشأ ثانية (محفوظة)', !calls.some((c) => c.model === 'utm.campaign'));
  ok('ونقرة إعلان بلا utm_medium ← الوسيط «Facebook» الموجود', order?.medium_id === 55 && !calls.some((c) => c.model === 'utm.medium' && c.method === 'create'));

  console.log('\n\x1b[1m3. طلب من غير إعلان\x1b[0m');
  calls = [];
  await odoo.createSaleOrder(customer, items, '', null, {});
  order = orderPayload();
  ok('لا حملة ولا وسيط', order && !('campaign_id' in order) && !('medium_id' in order));
  ok('والمصدر E-COMMERCE كالعادة', order?.source_id === 9);

  console.log('\n\x1b[1m4. أودو يرفض إنشاء الحملة\x1b[0m');
  calls = [];
  refuseCampaigns = true;
  let placed = null;
  try {
    placed = await odoo.createSaleOrder(customer, items, '', null, { ad: { campaign: 'B | Retargeting', fromAd: true } });
  } catch (err) {
    placed = err;
  }
  order = orderPayload();
  ok('الطلب يُنشأ رغم ذلك', placed && placed.name === 'S09999', String(placed?.message || ''));
  ok('بلا حملة، والوسيط موجود', order && !('campaign_id' in order) && order.medium_id === 55);
  refuseCampaigns = false;

  console.log('\n\x1b[1m5. ما يقبله الخادم من المتصفح (adOrigin)\x1b[0m');
  const { adOrigin } = require('../src/lib/adOrigin');
  ok('لا شيء ← null', adOrigin(undefined) === null && adOrigin({}) === null && adOrigin({ ad: 'x' }) === null);
  ok('بلا إعلان ← null', adOrigin({ ad: { fromAd: false } }) === null);
  const long = adOrigin({ ad: { campaign: 'ح'.repeat(300), medium: ' paid\u0000 ', fromAd: 'yes' } });
  ok('نص مقصوص ونظيف، وfromAd منطقي فقط', long.campaign.length === 100 && long.medium === 'paid' && long.fromAd === false);
  ok('غير النصوص تُترك', adOrigin({ ad: { campaign: { $ne: 1 }, fromAd: true } }).campaign === undefined);

  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` + (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : ''));
  failures.forEach((f) => console.log('  • ' + f));
  console.log('─'.repeat(52) + '\n');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
