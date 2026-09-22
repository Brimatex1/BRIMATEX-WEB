#!/usr/bin/env node
// The shop's categories come from Odoo - src/lib/odoo.js:fetchProducts.
//
// - only templates under Mattresses are asked for - the category alone decides
// - Economy is not sold online: excluded in the query itself
// - each card carries its tier (Economy, Comfort, Premium, Elite) with its
//   Arabic name and rank; an unknown subcategory keeps its Odoo name
// - sizes Odoo has not priced are left out of the picker; the card's price is
//   the first priced size, read from lst_price (extras included)
// - no Mattresses category: nothing is shown, rather than the whole ERP
//
// In-process against a mock Odoo. Runs with the rest: npm test

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const ODOO_PORT = 3186;

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

let hasRoot = true;
const calls = [];

const TEMPLATES = [
  { id: 1, name: 'Comfort Mattress', categ_id: [17, 'Mattresses / Comfort'], product_variant_ids: [101, 102] },
  { id: 2, name: 'Daily Mattress', categ_id: [17, 'Mattresses / Comfort'], product_variant_ids: [201, 202, 203] },
  { id: 3, name: 'Hotel Mattress', categ_id: [18, 'Mattresses / Premium'], product_variant_ids: [301] },
  { id: 4, name: 'Kids Mattress', categ_id: [20, 'Mattresses / Kids'], product_variant_ids: [401] },
  { id: 5, name: 'Plain Mattress', categ_id: [15, 'Mattresses'], product_variant_ids: [501] },
  { id: 6, name: 'Bordo Mattress D20', categ_id: [16, 'Mattresses / Economy'], product_variant_ids: [601] },
];
const VARIANTS = {
  101: { id: 101, default_code: 'CMF-1', lst_price: 680, qty_available: 3, product_template_attribute_value_ids: [1] },
  102: { id: 102, default_code: 'CMF-2', lst_price: 720, qty_available: 0, product_template_attribute_value_ids: [2] },
  201: { id: 201, default_code: 'BRD-1', lst_price: 0, qty_available: 0, product_template_attribute_value_ids: [1] },
  202: { id: 202, default_code: 'BRD-2', lst_price: 150, qty_available: 1, product_template_attribute_value_ids: [2] },
  203: { id: 203, default_code: 'BRD-3', lst_price: 160, qty_available: 1, product_template_attribute_value_ids: [3] },
  301: { id: 301, default_code: 'HTL-1', lst_price: 1900, qty_available: 2, product_template_attribute_value_ids: [] },
  401: { id: 401, default_code: 'KID-1', lst_price: 300, qty_available: 2, product_template_attribute_value_ids: [] },
  601: { id: 601, default_code: 'BRD-1', lst_price: 150, qty_available: 5, product_template_attribute_value_ids: [] },
  501: { id: 501, default_code: 'PLN-1', lst_price: 250, qty_available: 2, product_template_attribute_value_ids: [] },
};

function answer(model, method, args) {
  if (model === 'product.category' && method === 'search_read') {
    const domain = JSON.stringify(args[0]);
    if (domain.includes('"Mattresses"')) return hasRoot ? [{ id: 15 }] : [];
    return [
      { id: 16, name: 'Economy' },
      { id: 17, name: 'Comfort' },
      { id: 18, name: 'Premium' },
      { id: 19, name: 'Elite' },
      { id: 20, name: 'Kids' },
    ];
  }
  if (model === 'product.template' && method === 'search_read') {
    // Honours the one exclusion the shop asks for: "!" child_of Economy (16).
    const noEconomy = JSON.stringify(args[0]).includes('"!",["categ_id","child_of",16]');
    return TEMPLATES.filter((t) => !(noEconomy && t.categ_id[0] === 16));
  }
  if (model === 'product.product' && method === 'read') return args[0].map((id) => VARIANTS[id]).filter(Boolean);
  if (model === 'product.template.attribute.value' && method === 'read')
    return args[0].map((id) => ({ id, name: `مقاس ${id}` }));
  return [];
}

(async () => {
  const odoo = http.createServer((r, res) => {
    let text = '';
    r.on('data', (c) => (text += c));
    r.on('end', () => {
      const { params, id } = JSON.parse(text);
      let result;
      if (params.service === 'common') result = 7;
      else {
        const [, , , model, method, args] = params.args;
        calls.push({ model, method, args });
        result = answer(model, method, args);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
  });
  await new Promise((r) => odoo.listen(ODOO_PORT, '127.0.0.1', r));

  // odoo.js caches the uid in the settings file - restore it after.
  const settingsFile = path.join(__dirname, '..', 'src', 'data', 'settings.local.json');
  const before = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile) : null;
  process.env.DATABASE_URL = '';
  process.env.ODOO_URL = `http://127.0.0.1:${ODOO_PORT}`;
  process.env.ODOO_DB = 'test';
  process.env.ODOO_USERNAME = 'test';
  process.env.ODOO_API_KEY = 'test';
  const odooLib = require(path.join(__dirname, '..', 'src', 'lib', 'odoo'));

  try {
    const products = await odooLib.fetchProducts();
    const byName = Object.fromEntries(products.map((p) => [p.name, p]));

    const tplCall = calls.find((c) => c.model === 'product.template');
    const domain = JSON.stringify(tplCall?.args[0]);
    ok('يطلب منتجات Mattresses فقط', domain.includes('["categ_id","child_of",15]'), domain);
    ok('الفئة وحدها تقرّر (بدون شرط «يمكن بيعه»)', !domain.includes('sale_ok'), domain);

    ok('Comfort → كومفورت (2)', byName['Comfort Mattress']?.tier?.name === 'كومفورت' && byName['Comfort Mattress'].tier.rank === 2);
    ok('الاقتصادية مستبعدة في الطلب نفسه', domain.includes('"!",["categ_id","child_of",16]'), domain);
    ok('ولا منتج اقتصادي يظهر', !products.some((p) => p.tier?.key === 'economy') && !byName['Bordo Mattress D20']);
    ok('Premium → بريميوم', byName['Hotel Mattress']?.tier?.name === 'بريميوم');
    ok('فئة جديدة في أودو تظهر باسمها', byName['Kids Mattress']?.tier?.name === 'Kids' && byName['Kids Mattress'].tier.rank === 99);
    ok('منتج في Mattresses نفسها: بلا فئة', byName['Plain Mattress']?.tier === null);

    const bordo = byName['Daily Mattress'];
    ok('المقاس بلا سعر لا يظهر', bordo?.variants?.length === 2 && !bordo.variants.some((v) => v.id === 201), JSON.stringify(bordo?.variants));
    ok('هوية البطاقة أول مقاس مسعّر', bordo?.id === 202 && bordo.price === 150, `${bordo?.id} ${bordo?.price}`);
    ok('السعر من lst_price', byName['Comfort Mattress']?.variants?.[1]?.price === 720);

    hasRoot = false;
    ok('بلا فئة Mattresses: لا منتجات', (await odooLib.fetchProducts()).length === 0);
  } finally {
    if (before) fs.writeFileSync(settingsFile, before);
    else if (fs.existsSync(settingsFile)) fs.unlinkSync(settingsFile);
    odoo.closeAllConnections?.();
    odoo.close();
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
