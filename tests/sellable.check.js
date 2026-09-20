#!/usr/bin/env node
// What is sold and what is not - src/lib/sellable.js
//
// What it guards: Odoo publishes records that are not products. Three of them
// reached the live shop and were orderable: an accounting record named
// `Expenses`, and two half-created variants of a Bordeaux topper - all three
// priced at "1", which is not a price anyone typed but Odoo's `list_price`
// default for a record nobody priced.
//
// Runs with the rest: npm test
const { isSellable, isSoldOnline, isOfferable, UNPRICED } = require('../src/lib/sellable');

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

console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — ما يُباع ═══\x1b[0m');

group('1. الثلاثة التي وصلت المتجر الحيّ');
check('Expenses (سجلّ محاسبة) لا يُباع', !isSellable({ id: 6, name: 'Expenses', price: 1 }));
check(
  'فرشة بوردو 15/17 (H7) بسعر 1 لا تُباع',
  !isSellable({ id: 7825, name: 'فرشة بوردو ضغط 15/17 (H7, 70*180)', price: 1 })
);
check(
  'فرشة بوردو 20/22 (H9) بسعر 1 لا تُباع',
  !isSellable({ id: 7826, name: 'فرشة بوردو ضغط 20/22 (H9, 70*190)', price: 1 })
);

group('2. المنتجات الحقيقية تبقى');
// The cheapest product in the live catalogue the day this was written: 53 LYD.
check('أرخص منتج فعلي (53 د.ل) يُباع', isSellable({ name: 'فرشة بوردو ضغط 12/14', price: 53 }));
check('مرتبة رويال (290) تُباع', isSellable({ name: 'مرتبة رويال', price: 290 }));
check('قالب إسفنج كينج (2565) يُباع', isSellable({ name: 'قالب اسفنج كينج 32', price: 2565 }));
check('سعرٌ فوق الحدّ بقليل (1.01) يُباع', isSellable({ price: UNPRICED + 0.01 }));

group('3. الحدّ نفسه وما تحته');
check('سعر 1 بالضبط لا يُباع', !isSellable({ price: 1 }));
check('سعر 0 لا يُباع', !isSellable({ price: 0 }));
check('سعر سالب لا يُباع', !isSellable({ price: -5 }));

group('4. مدخلات فاسدة لا تنفذ ولا تُسقط الخادم');
check('بلا حقل سعر', !isSellable({ name: 'بلا سعر' }));
check('سعر null', !isSellable({ price: null }));
check('سعر نصّ غير رقمي', !isSellable({ price: 'مجاناً' }));
check('سعر NaN', !isSellable({ price: NaN }));
check('سعر Infinity لا يُعتبر سعراً', !isSellable({ price: Infinity }));
check('الكائن نفسه null', !isSellable(null));
check('الكائن نفسه undefined', !isSellable(undefined));
// Odoo returns prices as numbers, but JSON from the dashboard may carry them as text.
check('سعر نصّي صالح "290" يُباع', isSellable({ price: '290' }));

group('5. التنويعات تُفحَص كالبطاقات');
// productLookup in server.js makes every variant an orderable id, so checking
// the card alone is not enough.
check('تنويعة مسعَّرة تُباع', isSellable({ id: 7831, label: '90*190', price: 56 }));
check('تنويعة بلا سعر لا تُباع', !isSellable({ id: 7825, label: '70*180', price: 1 }));

group('6. الإسفنج لا يُباع عبر الإنترنت — العشرة في الكتالوج الحيّ');
// Their names exactly as Odoo returns them, the day this test was written.
const FOAM = [
  'قالب اسفنج ابيض ضغط 17',
  'قالب اسفنج اخضر ضغط 17',
  'قالب اسفنج اخضر ضغط 22',
  'قالب اسفنج رويال 22',
  'قالب اسفنج ريلاكس 28',
  'قالب اسفنج كراون 17',
  'قالب اسفنج كلاسيك 20',
  'قالب اسفنج كمفورت 30',
  'قالب اسفنج كينج 32',
  'قالب اسفنج لايت 14',
];
check(
  'العشرة كلّها لا تُباع',
  FOAM.every((name) => !isSoldOnline({ name })),
  FOAM.filter((name) => isSoldOnline({ name })).join(', ')
);
check('«إسفنج» بالهمزة تُطابَق أيضاً', !isSoldOnline({ name: 'قالب إسفنج كراون 17' }));
check('foam بالإنجليزية تُطابَق', !isSoldOnline({ name: 'High density foam block' }));

group('7. المراتب والفرشات تبقى');
// Toppers are foam-filled but a finished product, not a block, and their names
// read "فرشة ..." - so they do not match the rule. That is what keeps the
// website and the app in agreement.
check('مرتبة رويال تُباع', isSoldOnline({ name: 'مرتبة رويال' }));
check('فرشة بوردو ضغط 12/14 تُباع', isSoldOnline({ name: 'فرشة بوردو ضغط 12/14' }));
check('فرشة جكار نشاف 30 تُباع', isSoldOnline({ name: 'فرشة جكار نشاف 30' }));
check('اسم مفقود لا يُحجب بالخطأ', isSoldOnline({ price: 290 }));

group('8. isOfferable تجمع القاعدتين');
check('مرتبة مسعَّرة تُعرض وتُطلب', isOfferable({ name: 'مرتبة رويال', price: 290 }));
check('قالب مسعَّر لا يُعرض (قرار تجاري)', !isOfferable({ name: 'قالب اسفنج كينج 32', price: 2565 }));
check('مرتبة بلا سعر لا تُعرض (بيانات)', !isOfferable({ name: 'مرتبة رويال', price: 1 }));
check('قالب بلا سعر لا يُعرض (كلاهما)', !isOfferable({ name: 'قالب اسفنج لايت 14', price: 1 }));
// A variant inherits the card's name in productLookup ({...p, ...v}) and carries
// no name of its own, so the name rule applies to it - which is what stops a
// block's variant being ordered by its id.
check(
  'تنويعة قالب (ترث الاسم) لا تُطلب',
  !isOfferable({ id: 7751, name: 'قالب اسفنج اخضر ضغط 22', label: '140*180', price: 1720 })
);

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
