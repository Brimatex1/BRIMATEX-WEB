#!/usr/bin/env node
// ما يُباع وما لا يُباع — src/lib/sellable.js
//
// الحالة التي يحميها: أودو ينشر سجلّات ليست منتجات. ثلاثة منها وصلت المتجر
// الحيّ وكانت قابلة للطلب: سجلّ محاسبة اسمه `Expenses`، وتنويعتان نصف
// مُنشأتين من فرشة بوردو — ثلاثتها بسعر «1»، وهو ليس سعراً كتبه أحد بل
// افتراض `list_price` في أودو لسجلٍّ لم يُسعَّر.
//
// يشغَّل مع بقية الاختبارات: npm test

const { isSellable, UNPRICED } = require('../src/lib/sellable');

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
// أرخص منتج في الكتالوج الحيّ يوم كُتب هذا: 53 د.ل.
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
// أودو يعيد الأسعار أرقاماً، لكن JSON من لوحة الإدارة قد يحملها نصّاً.
check('سعر نصّي صالح "290" يُباع', isSellable({ price: '290' }));

group('5. التنويعات تُفحَص كالبطاقات');
// productLookup في server.js يجعل كل تنويعة معرّفاً قابلاً للطلب، فلا يكفي
// فحص البطاقة وحدها.
check('تنويعة مسعَّرة تُباع', isSellable({ id: 7831, label: '90*190', price: 56 }));
check('تنويعة بلا سعر لا تُباع', !isSellable({ id: 7825, label: '70*180', price: 1 }));

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
