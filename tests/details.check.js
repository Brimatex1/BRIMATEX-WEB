#!/usr/bin/env node
// The printed catalogue's details, shipped with the site - src/lib/productDetails.js
//
// What it guards: every icon a mattress names exists in the website's icon
// library (an unknown key silently shows nothing), its warranty icon agrees
// with its warranty years, and what the dashboard sets still wins.
//
// Runs with the rest: npm test
const fs = require('fs');
const path = require('path');
const { detailsFor } = require('../src/lib/productDetails');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function group(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'product-details.json'), 'utf8'));
const entries = Object.entries(MAP).filter(([key]) => !key.startsWith('//'));
const iconsTs = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'lib', 'icons.ts'), 'utf8');
const KNOWN = new Set([...iconsTs.matchAll(/^\s*'([a-z0-9-]+)': \{ key:/gm)].map((m) => m[1]));

group('Every mattress');
check('the icon library was read', KNOWN.size > 20, String(KNOWN.size));
check('the map is not empty', entries.length > 0);
for (const [key, entry] of entries) {
  const name = entry.product || key;
  check(`${name}: keyed by an Odoo id`, /^\d+$/.test(key), key);
  const d = detailsFor({ templateId: Number(key) });
  check(`${name}: has a description`, Boolean(d.description) && d.description.length > 60);
  const unknown = d.iconKeys.filter((k) => !KNOWN.has(k));
  check(`${name}: every icon exists`, unknown.length === 0, unknown.join(', '));
  check(`${name}: no icon twice`, new Set(d.iconKeys).size === d.iconKeys.length);
  const warrantyIcons = d.iconKeys.filter((k) => k.startsWith('warranty-'));
  check(
    `${name}: the warranty icon matches ${d.warrantyYears ?? 'no'} years`,
    d.warrantyYears ? warrantyIcons.length === 1 && warrantyIcons[0] === `warranty-${d.warrantyYears}` : warrantyIcons.length === 0,
    warrantyIcons.join(', ')
  );
  check(`${name}: nothing dropped while reading`, d.iconKeys.length === entry.iconKeys.length && d.layers.length === entry.layers.length);
}

group('Matching');
check('an unknown product has none', detailsFor({ templateId: 1 }).description === null && detailsFor({ templateId: 1 }).iconKeys.length === 0);
check('no id, no details (a name is not enough)', detailsFor({ name: 'Classic Mattress' }).description === null && detailsFor(undefined).description === null);
check('a renamed product keeps its details', detailsFor({ templateId: Number(entries[0][0]), name: 'مرتبة باسم جديد' }).description === detailsFor({ templateId: Number(entries[0][0]) }).description);

group('The dashboard wins');
(async () => {
  const productOverrides = require('../src/lib/productOverrides');
  const { withOverrides } = require('../src/lib/catalogue');
  const original = productOverrides.getAllOverrides;
  const templateId = Number(entries[0][0]);
  const d = detailsFor({ templateId });
  const product = { id: 999002, templateId, name: 'أي اسم', price: 100, description: 'من أودو' };

  productOverrides.getAllOverrides = async () => ({});
  const [plain] = await withOverrides([product]);
  check('no override → the catalogue description', plain.description === d.description);
  check('no override → the catalogue icons', JSON.stringify(plain.iconFeatures) === JSON.stringify(d.iconKeys));
  check('the warranty and layers ride along', plain.warrantyYears === d.warrantyYears && plain.layers.length === d.layers.length);

  productOverrides.getAllOverrides = async () => ({
    [product.id]: { iconKeys: ['memory-foam'], description: 'من اللوحة', enabled: true, imageUrl: null },
  });
  const [set] = await withOverrides([product]);
  check('dashboard icons win', JSON.stringify(set.iconFeatures) === JSON.stringify(['memory-foam']));
  check('a dashboard description wins', set.description === 'من اللوحة');

  productOverrides.getAllOverrides = async () => ({
    [product.id]: { iconKeys: [], description: null, enabled: true, imageUrl: null },
  });
  const [empty] = await withOverrides([product]);
  check('empty dashboard fields fall back to the catalogue', empty.description === d.description && empty.iconFeatures.length === d.iconKeys.length);

  productOverrides.getAllOverrides = original;

  console.log('\n' + '─'.repeat(52));
  if (fail === 0) {
    console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass}`);
  } else {
    console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail} — \x1b[31m${fail} فاشل\x1b[0m`);
    console.log('\n\x1b[31mالاختبارات الفاشلة:\x1b[0m');
    failures.forEach((f) => console.log('  • ' + f));
  }
  console.log('─'.repeat(52) + '\n');
  process.exit(fail === 0 ? 0 : 1);
})();
