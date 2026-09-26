#!/usr/bin/env node
// Pre-orders - src/lib/preorder.js, and what they change in Meta's feed and
// the page's structured data.
//
// What it guards: with pre-orders on, an out-of-stock mattress is marked
// orderable (never shown as in stock), Meta's feed lists it as "available for
// order" (advertised) rather than "out of stock" (not), Google reads
// schema.org's PreOrder, and the Odoo order's note names what has to be made.
//
// Runs with the rest: npm test
const { withPreorder, preorderNote, leadText } = require('../src/lib/preorder');
const metaFeed = require('../src/lib/metaFeed');
const share = require('../src/lib/share');

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

const origin = 'https://brimatex.ly';
const catalogue = [
  {
    id: 10,
    name: 'مرتبة كلاسيك',
    price: 355,
    image: '/images/products/classic.webp',
    inStock: false,
    variants: [
      { id: 10, label: 'H18 / 190*90', price: 355, inStock: false },
      { id: 11, label: 'H24 / 190*90', price: 355, inStock: true },
    ],
  },
  { id: 20, name: 'مرتبة هوتيل', price: 1350, image: '/images/products/hotel.webp', inStock: false },
  { id: 30, name: 'مرتبة ديلي', price: 475, image: '/images/products/daily.webp', inStock: true },
];

console.log('\n\x1b[1m1. العلامات\x1b[0m');
const off = withPreorder(catalogue, { enabled: false, days: 7 });
ok('مُطفأ: لا طلب مسبق ولا مدة', off.every((p) => p.preorder === false && p.leadDays === null && (p.variants ?? []).every((v) => !v.preorder)));
const on = withPreorder(catalogue, { enabled: true, days: 7 });
ok('النافد: طلب مسبق', on[1].preorder === true && on[0].variants[0].preorder === true);
ok('المتوفّر: لا', on[2].preorder === false && on[0].variants[1].preorder === false);
ok('المخزون لا يتغيّر — لا يُعرض متوفّراً', on[1].inStock === false && on[0].variants[0].inStock === false);
ok('مدة التجهيز على كل بطاقة', on.every((p) => p.leadDays === 7));
ok('بلا مدة: null', withPreorder(catalogue, { enabled: true, days: null }).every((p) => p.leadDays === null));

console.log('\n\x1b[1m2. الكلمات\x1b[0m');
ok('العدد بصيغته', [leadText(null), leadText(1), leadText(2), leadText(7), leadText(14)].join('|') === 'يُصنع على الطلب|يُصنع خلال يوم|يُصنع خلال يومين|يُصنع خلال 7 أيام|يُصنع خلال 14 يوماً');

console.log('\n\x1b[1m3. ملاحظة الطلب في أودو\x1b[0m');
const items = [{ productId: 10, quantity: 1 }, { productId: 11, quantity: 1 }, { productId: 20, quantity: 2 }];
ok('تسمّي ما يُصنع فقط', preorderNote(items, catalogue, { enabled: true, days: 7 }) === 'طلب مسبق — يُصنع خلال 7 أيام: مرتبة كلاسيك (H18 / 190*90)، مرتبة هوتيل', preorderNote(items, catalogue, { enabled: true, days: 7 }));
ok('طلب من المتوفّر: بلا ملاحظة', preorderNote([{ productId: 30, quantity: 1 }], catalogue, { enabled: true, days: 7 }) === null);
ok('مُطفأ: بلا ملاحظة', preorderNote(items, catalogue, { enabled: false }) === null);

console.log('\n\x1b[1m4. كتالوج ميتا\x1b[0m');
const avail = (products) =>
  Object.fromEntries(metaFeed.buildCsv(products, { origin }).csv.trim().split('\n').slice(1).map((l) => [l.split(',')[0], l.match(/"(in stock|out of stock|available for order)"/)?.[1]]));
const feedOn = avail(on);
ok('المقاس النافد: متاح للطلب', feedOn['"10"'] === 'available for order', JSON.stringify(feedOn));
ok('المنتج بلا مقاسات النافد: متاح للطلب', feedOn['"20"'] === 'available for order');
ok('المتوفّر: in stock', feedOn['"11"'] === 'in stock' && feedOn['"30"'] === 'in stock');
ok('مُطفأ: out of stock كما كان', avail(off)['"20"'] === 'out of stock');

console.log('\n\x1b[1m5. بيانات جوجل\x1b[0m');
const offerOf = (product) =>
  share.structuredData({ type: 'product', product, title: product.name, price: product.price }, { origin }, `${origin}/product/${product.id}`).find((b) => b['@type'] === 'Product')?.offers;
ok('نافد بطلب مسبق: PreOrder', offerOf(on[1])?.availability === 'https://schema.org/PreOrder', JSON.stringify(offerOf(on[1])));
ok('نافد بلا طلب مسبق: OutOfStock', offerOf(off[1])?.availability === 'https://schema.org/OutOfStock');
ok('متوفّر: InStock', offerOf(on[2])?.availability === 'https://schema.org/InStock');

console.log('\n' + '─'.repeat(52));
console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` + (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : ''));
failures.forEach((f) => console.log('  • ' + f));
console.log('─'.repeat(52) + '\n');
process.exit(fail === 0 ? 0 : 1);
