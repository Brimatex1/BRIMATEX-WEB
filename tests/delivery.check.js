// The app's delivery and payment choice (src/lib/delivery.js): what an order
// may ask for, and what the team reads on it.
'use strict';

const { readDelivery, dayLabel } = require('../src/lib/delivery');

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — التوصيل والدفع ═══\x1b[0m');
// Friday 2 October 2026, noon in Tripoli.
const now = new Date('2026-10-02T10:00:00Z');

const home = readDelivery({ delivery: { method: 'home', date: '2026-10-03', slot: 'morning' }, paymentMethod: 'card' }, now);
ok('توصيل السبت صباحاً يُقبل', !home.error && home.method === 'home', JSON.stringify(home));
ok('تاريخ التسليم لأودو بتوقيت UTC (09:00 طرابلس = 07:00)', home.commitmentDate === '2026-10-03 07:00:00', home.commitmentDate);
ok('الملاحظة تقول اليوم والفترة', home.noteLines.includes('موعد التوصيل: السبت 3 أكتوبر · صباحاً'), home.noteLines.join(' | '));
ok('والدفع', home.noteLines.includes('الدفع عند الاستلام: بطاقة مصرفية'));
ok('المساء 17:00 = 15:00 UTC', readDelivery({ delivery: { method: 'home', date: '2026-10-03', slot: 'evening' } }, now).commitmentDate === '2026-10-03 15:00:00');

ok('الجمعة مرفوضة', readDelivery({ delivery: { method: 'home', date: '2026-10-09', slot: 'morning' } }, now).error === 'لا يوجد توصيل يوم الجمعة');
ok('اليوم نفسه مرفوض', Boolean(readDelivery({ delivery: { method: 'home', date: '2026-10-02', slot: 'morning' } }, now).error));
ok('يوم بعيد جداً مرفوض', Boolean(readDelivery({ delivery: { method: 'home', date: '2027-01-30', slot: 'morning' } }, now).error));
ok('فترة غير معروفة مرفوضة', Boolean(readDelivery({ delivery: { method: 'home', date: '2026-10-03', slot: 'night' } }, now).error));
ok('تاريخ مشوّه مرفوض', Boolean(readDelivery({ delivery: { method: 'home', date: '3/10', slot: 'morning' } }, now).error));
ok('طريقة دفع غير معروفة مرفوضة', Boolean(readDelivery({ delivery: { method: 'pickup' }, paymentMethod: 'crypto' }, now).error));

const pickup = readDelivery({ delivery: { method: 'pickup' }, paymentMethod: 'cash' }, now);
ok('الاستلام من الصالة بلا موعد', !pickup.error && pickup.commitmentDate === null && pickup.noteLines[0] === 'الاستلام: استلام من الصالة');
ok('طلب الموقع (بلا توصيل ولا دفع) كما كان', readDelivery({}, now).none === true);
ok('اسم اليوم بالعربية', dayLabel('2026-10-04') === 'الأحد 4 أكتوبر', dayLabel('2026-10-04'));

console.log('\n' + '─'.repeat(52));
console.log(`\x1b[1mالنتيجة:\x1b[0m ${fail ? `\x1b[31m${fail} فاشل\x1b[0m / ` : ''}\x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
console.log('─'.repeat(52) + '\n');
process.exit(fail ? 1 : 0);
