#!/usr/bin/env node
// Availability and delivery times - src/lib/availability.js, in place of pre-orders:
//  - the public catalogue shows every size as available, with no stock count
//    and no pre-order mark, and with the same delivery for every size: free
//    inside Tripoli within 48 hours (the owner's rule, Oct 2026)
//  - the Odoo order's note names, for the warehouse, what is not in stock
//  - the panel reads that note: «قيد التجهيز (غير متوفر في المخزن)»
//
// Runs with the rest: npm test

'use strict';

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } else {
    fail++;
    failures.push(name);
    console.log('  \x1b[31m✗\x1b[0m ' + name + (detail ? ' — ' + detail : ''));
  }
}

const { withAvailability, stockNote, notInStockFromNote, rangeText } = require('../src/lib/availability');
const panel = require('../src/lib/panel');
const metaFeed = require('../src/lib/metaFeed');

const H48 = 'توصيل مجاني داخل طرابلس · خلال 48 ساعة';
const raw = [
  {
    id: 1,
    name: 'هوتيل',
    image: '/images/products/hotel.webp',
    price: 1370,
    inStock: true,
    stock: 6,
    variants: [
      { id: 1, label: '90*190', price: 1370, inStock: true, stock: 6 },
      { id: 2, label: '180*200', price: 2515, inStock: false, stock: 0 },
    ],
  },
  { id: 9, name: 'وسادة', image: '/x.webp', price: 80, inStock: false, stock: 0 },
];

console.log('\nالكتالوج العام: كل شيء متوفر، والتوصيل خلال 48 ساعة لكل المقاسات');
const pub = withAvailability(raw);
const [inStock, notInStock] = pub[0].variants;
ok('المقاس المتوفر: متوفر، خلال 48 ساعة', inStock.inStock === true && JSON.stringify(inStock.deliveryDays) === '[2,2]' && inStock.deliveryText === H48, JSON.stringify(inStock));
ok('غير المتوفر: يظهر متوفراً، خلال 48 ساعة أيضاً', notInStock.inStock === true && JSON.stringify(notInStock.deliveryDays) === '[2,2]' && notInStock.deliveryText === H48, JSON.stringify(notInStock));
ok('لا كميات ولا طلب مسبق في الكتالوج العام', pub.every((p) => p.stock === null && p.preorder === false && p.leadDays === null && (p.variants ?? []).every((v) => v.stock === null && v.preorder === false)));
ok('منتج بمقاس واحد غير متوفر: خلال 48 ساعة', pub[1].inStock === true && JSON.stringify(pub[1].deliveryDays) === '[2,2]' && pub[1].deliveryText === H48);
ok('الكتالوج الأصلي لم يتغيّر (المخزن الحقيقي باقٍ على الخادم)', raw[0].variants[1].inStock === false && raw[0].variants[1].stock === 0);
ok('كتالوج ميتا: كل المقاسات «in stock»', metaFeed.rowsFor(pub[0], { origin: 'https://brimatex.ly' }).every((r) => r.availability === 'in stock'));

console.log('\nملاحظة الطلب للمخزن');
const note = stockNote([{ productId: 2, quantity: 1 }, { productId: 1, quantity: 1 }], raw);
ok('تسمّي غير المتوفر فقط', note === 'غير متوفر في المخزن — يُجهَّز للتوصيل خلال 48 ساعة: هوتيل (180*200)', note);
ok('كل شيء متوفر: لا ملاحظة', stockNote([{ productId: 1, quantity: 2 }], raw) === null);
ok('تُقرأ من الملاحظة (والطلب المسبق القديم أيضاً)', notInStockFromNote(`الدفع عند الاستلام: نقداً\n${note}`) && notInStockFromNote('طلب مسبق — يُصنع خلال يومين: x') && !notInStockFromNote('الاستلام: توصيل إلى المنزل'));

console.log('\nلوحة التحكم');
const order = { invoiceStatus: 'confirmed', note, placedAt: '2026-10-06T10:00:00Z' };
ok('طلب مؤكد فيه غير متوفر: قيد التجهيز', panel.statusOf(order) === 'preparing');
ok('مرحلة «قيد التجهيز (غير متوفر في المخزن)»', panel.timelineOf(order).some((s) => s.label === 'قيد التجهيز (غير متوفر في المخزن)' && s.state === 'current'));
ok('طلب مؤكد كله متوفر: مؤكد', panel.statusOf({ invoiceStatus: 'confirmed', note: 'الاستلام: توصيل إلى المنزل' }) === 'confirmed');

console.log('\nالنصوص');
ok('1–3 أيام عمل · 3–5 أيام · يومين · يوم', [rangeText([1, 3], true), rangeText([3, 5]), rangeText([2, 2]), rangeText([1, 1])].join(' · ') === '1–3 أيام عمل · 3–5 أيام · يومين · يوم');

console.log(`\n\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
if (fail) {
  console.log('\x1b[31mالفحوص الفاشلة:\x1b[0m\n' + failures.map((f) => '  • ' + f).join('\n'));
  process.exit(1);
}
