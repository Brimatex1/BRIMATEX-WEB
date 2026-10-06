#!/usr/bin/env node
// Offers (العروض) - a dated line in Odoo's retail price list:
//  - src/lib/odoo.js offerPrice: a lower fixed price or a percentage off the
//    regular price while it runs; the size's own line wins over its product's;
//    a line that does not lower the price is no offer
//  - src/lib/metaFeed.js: the regular price as price, the offer's as sale_price
//  - src/lib/share.js: a size's page states the price it sells for
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

const odoo = require('../src/lib/odoo');
const metaFeed = require('../src/lib/metaFeed');
const share = require('../src/lib/share');

console.log('\nالعروض من قائمة الأسعار (src/lib/odoo.js offerPrice)');
const prices = {
  promoByVariant: new Map([
    [1, { fixed: 900, percent: null, endsAt: '2026-10-20T00:00:00.000Z' }],
    [2, { fixed: 1200, percent: null, endsAt: null }],
  ]),
  promoByTemplate: new Map([[10, { fixed: null, percent: 15, endsAt: null }]]),
};
const a = odoo.offerPrice(prices, 1, 10, 1000);
ok('سعر ثابت أقل: عرض بالسعر القديم وتاريخ الانتهاء', a.price === 900 && a.wasPrice === 1000 && a.offerEndsAt === '2026-10-20T00:00:00.000Z', JSON.stringify(a));
ok('سطر المقاس يتقدّم على سطر المرتبة', odoo.offerPrice(prices, 1, 10, 1000).price === 900);
ok('سعر «العرض» أعلى من العادي: لا عرض', JSON.stringify(odoo.offerPrice(prices, 2, 99, 1000)) === '{"price":1000}');
const pct = odoo.offerPrice(prices, 3, 10, 1370);
ok('نسبة على المرتبة كلها: 15٪', pct.price === 1164.5 && pct.wasPrice === 1370, JSON.stringify(pct));
ok('بلا عرض: السعر العادي وحده', JSON.stringify(odoo.offerPrice({}, 4, 11, 1000)) === '{"price":1000}');
ok('بلا سعر عادي: لا عرض', JSON.stringify(odoo.offerPrice(prices, 1, 10, 0)) === '{"price":0}');

console.log('\nكتالوج ميتا: السعر العادي وسعر العرض');
const origin = 'https://brimatex.ly';
const product = {
  id: 5629,
  name: 'هوتيل',
  image: '/images/products/hotel.webp',
  tier: { key: 'premium', name: 'بريميوم', rank: 3 },
  variants: [
    { id: 5629, label: '90*190', price: 1200, wasPrice: 1370, offerEndsAt: null, inStock: true },
    { id: 5632, label: '180*200', price: 2515, inStock: true },
  ],
};
const [onOffer, regular] = metaFeed.rowsFor(product, { origin });
ok('مقاس عليه عرض: price العادي وsale_price العرض', onOffer.price === '1370.00 LYD' && onOffer.sale_price === '1200.00 LYD', `${onOffer.price} / ${onOffer.sale_price}`);
ok('مقاس بلا عرض: sale_price فارغ', regular.price === '2515.00 LYD' && regular.sale_price === '');
ok('عمود sale_price في الملف', metaFeed.buildCsv([product], { origin }).csv.split('\n')[0].split(',').includes('sale_price'));
const single = metaFeed.rowsFor({ id: 7, name: 'وسادة', image: '/x.webp', price: 80, wasPrice: 100 }, { origin })[0];
ok('منتج بمقاس واحد عليه عرض', single.price === '100.00 LYD' && single.sale_price === '80.00 LYD');

console.log('\nصفحة المقاس تذكر السعر الذي يُباع به');
const page = share.render('<html><head><title>x</title></head><body></body></html>', '/product/5629', '?variant=5629', { products: [product], banners: [], origin });
const amount = page.match(/product:price:amount" content="([^"]+)"/)?.[1];
ok('سعر الصفحة = sale_price في الكتالوج', amount === '1200', amount);

console.log(`\n\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
if (fail) {
  console.log('\x1b[31mالفحوص الفاشلة:\x1b[0m\n' + failures.map((f) => '  • ' + f).join('\n'));
  process.exit(1);
}
