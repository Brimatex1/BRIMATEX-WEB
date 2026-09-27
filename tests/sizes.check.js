#!/usr/bin/env node
// Size order - src/lib/sizes.js, and the catalogue and Meta feed that use it.
//
// What it guards: the owner's main sizes (90×190, 100×200, 120×200, 160×200,
// 180×200, 200×200) come first everywhere - thinnest first within each - and
// every other size after; a product keeps its own id whatever the order; the
// feed marks the main sizes for ads.
//
// Runs with the rest: npm test
const { sortSizes, isMainSize, parseSize } = require('../src/lib/sizes');
const { rowsFor } = require('../src/lib/metaFeed');

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

console.log('\n\x1b[1m1. قراءة المقاس\x1b[0m');
ok('H18 / 190*100', JSON.stringify(parseSize('H18 / 190*100')) === JSON.stringify({ width: 100, length: 190, height: 18 }));
ok('بلا ارتفاع، وبالعرض أولاً', JSON.stringify(parseSize('90x190')) === JSON.stringify({ width: 90, length: 190, height: null }));
ok('الأساسية تُعرف بأي ترتيب', isMainSize('H24 / 190*90') && isMainSize('200*160') && !isMainSize('H18 / 190*100') && !isMainSize('H18 / 200*90'));

console.log('\n\x1b[1m2. الترتيب\x1b[0m');
// Odoo's own order for the Classic, roughly: the 190s first, then the 200s.
const odooOrder = [
  'H18 / 190*100', 'H24 / 190*100', 'H18 / 190*120', 'H18 / 190*80', 'H18 / 190*90', 'H24 / 190*90',
  'H18 / 200*100', 'H28 / 200*200', 'H18 / 200*200', 'H24 / 200*200', 'H18 / 200*120', 'H18 / 200*160',
  'H18 / 200*180', 'H18 / 200*90', 'H28 / 190*160',
];
const sorted = sortSizes(odooOrder.map((label, i) => ({ id: 100 + i, label }))).map((v) => v.label);
ok('المقاسات الأساسية أولاً وبترتيب المالك', sorted.slice(0, 9).join('|') === [
  'H18 / 190*90', 'H24 / 190*90', 'H18 / 200*100', 'H18 / 200*120', 'H18 / 200*160', 'H18 / 200*180',
  'H18 / 200*200', 'H24 / 200*200', 'H28 / 200*200',
].join('|'), sorted.join(' | '));
ok('داخل المقاس: الأنحف أولاً (H18 ثم H24 ثم H28)', sorted.indexOf('H18 / 200*200') < sorted.indexOf('H24 / 200*200') && sorted.indexOf('H24 / 200*200') < sorted.indexOf('H28 / 200*200'));
ok('ثم الباقي، الأضيق أولاً', sorted.slice(9).join('|') === ['H18 / 190*80', 'H18 / 200*90', 'H18 / 190*100', 'H24 / 190*100', 'H18 / 190*120', 'H28 / 190*160'].join('|'), sorted.slice(9).join(' | '));
ok('لا يغيّر المصفوفة الأصلية', odooOrder[0] === 'H18 / 190*100');

console.log('\n\x1b[1m3. ملف كتالوج ميتا\x1b[0m');
const product = {
  id: 101,
  name: 'مرتبة كلاسيك',
  image: 'https://brimatex.ly/images/products/classic.webp',
  variants: sortSizes([
    { id: 101, label: 'H18 / 190*100', price: 470 },
    { id: 102, label: 'H18 / 190*90', price: 425 },
    { id: 103, label: 'H18 / 200*200', price: 925 },
  ]),
};
const rows = rowsFor(product, { origin: 'https://brimatex.ly' });
ok('أول صف: 90×190', rows[0]?.size === 'H18 / 190*90', rows.map((r) => r.size).join(' | '));
ok('المجموعة باسم المنتج نفسه (id لا يتغيّر)', rows.every((r) => r.item_group_id === 101));
ok('علامة المقاس الأساسي', rows[0].custom_label_2 === 'مقاس أساسي' && rows.find((r) => r.size === 'H18 / 190*100').custom_label_2 === 'مقاس إضافي');

console.log('\n' + '─'.repeat(52));
console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` + (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : ''));
failures.forEach((f) => console.log('  • ' + f));
console.log('─'.repeat(52) + '\n');
process.exit(fail === 0 ? 0 : 1);
