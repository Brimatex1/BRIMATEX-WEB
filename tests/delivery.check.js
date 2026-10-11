// The checkout's delivery and payment (src/lib/delivery.js): home delivery in
// Tripoli within 48 hours, the branch, or an authorized distributor outside
// Tripoli - what an order may ask for, and what the team reads on it.
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

// Home delivery is inside Tripoli only, within 48 hours: from Sunday 4 October.
const TRIPOLI = { city: 'طرابلس' };
const home = readDelivery({ customer: TRIPOLI, delivery: { method: 'home', date: '2026-10-04', slot: 'morning' }, paymentMethod: 'card' }, now);
ok('طرابلس: توصيل الأحد صباحاً يُقبل', !home.error && home.method === 'home', JSON.stringify(home));
ok('تاريخ التسليم لأودو بتوقيت UTC (09:00 طرابلس = 07:00)', home.commitmentDate === '2026-10-04 07:00:00', home.commitmentDate);
ok('الملاحظة تقول اليوم والفترة', home.noteLines.includes('موعد التوصيل: الأحد 4 أكتوبر · صباحاً'), home.noteLines.join(' | '));
ok('والدفع', home.noteLines.includes('الدفع عند الاستلام: بطاقة مصرفية'));
ok('المساء 17:00 = 15:00 UTC', readDelivery({ customer: TRIPOLI, delivery: { method: 'home', date: '2026-10-04', slot: 'evening' } }, now).commitmentDate === '2026-10-04 15:00:00');

ok('خلال 48 ساعة: الغد مرفوض', /48 ساعة/.test(readDelivery({ customer: TRIPOLI, delivery: { method: 'home', date: '2026-10-03', slot: 'morning' } }, now).error || ''));
ok('الجمعة مرفوضة', readDelivery({ customer: TRIPOLI, delivery: { method: 'home', date: '2026-10-09', slot: 'morning' } }, now).error === 'لا يوجد توصيل يوم الجمعة');
ok('اليوم نفسه مرفوض', Boolean(readDelivery({ customer: TRIPOLI, delivery: { method: 'home', date: '2026-10-02', slot: 'morning' } }, now).error));
ok('يوم بعيد جداً مرفوض', Boolean(readDelivery({ customer: TRIPOLI, delivery: { method: 'home', date: '2027-01-30', slot: 'morning' } }, now).error));
ok('فترة غير معروفة مرفوضة', Boolean(readDelivery({ customer: TRIPOLI, delivery: { method: 'home', date: '2026-10-04', slot: 'night' } }, now).error));
ok('تاريخ مشوّه مرفوض', Boolean(readDelivery({ customer: TRIPOLI, delivery: { method: 'home', date: '3/10', slot: 'morning' } }, now).error));
ok('طريقة دفع غير معروفة مرفوضة', Boolean(readDelivery({ delivery: { method: 'pickup' }, paymentMethod: 'crypto' }, now).error));

const outside = readDelivery({ customer: { city: 'مصراتة' }, delivery: { method: 'home', date: '2026-10-04', slot: 'morning' } }, now);
ok('مصراتة: لا توصيل إلى المنزل', outside.code === 'home_outside_tripoli' && /داخل طرابلس فقط/.test(outside.error), JSON.stringify(outside));
ok('«طرابلس » بمسافة أو تشكيل تُقبل', !readDelivery({ customer: { city: ' طَرابلس ' }, delivery: { method: 'home', date: '2026-10-04', slot: 'morning' } }, now).error);

const dist = readDelivery({ customer: { city: 'مصراتة' }, delivery: { method: 'distributor', distributorId: 1103 }, paymentMethod: 'cash' }, now);
ok('خارج طرابلس: الاستلام من موزّع معتمد بلا موعد', !dist.error && dist.distributorId === 1103 && dist.commitmentDate === null && dist.noteLines[0] === 'الاستلام: استلام من موزّع معتمد', JSON.stringify(dist));
ok('موزّع بلا رقم مقبول (يتصل الفريق)', readDelivery({ customer: { city: 'سبها' }, delivery: { method: 'distributor' } }, now).distributorId === null);
ok('رقم موزّع مشوّه مرفوض', Boolean(readDelivery({ delivery: { method: 'distributor', distributorId: 'x' } }, now).error));

const pickup = readDelivery({ delivery: { method: 'pickup' }, paymentMethod: 'cash' }, now);
ok('الاستلام من الفرع بلا موعد', !pickup.error && pickup.commitmentDate === null && pickup.noteLines[0] === 'الاستلام: استلام من الفرع', JSON.stringify(pickup.noteLines));
ok('طلب بلا توصيل ولا دفع (عميل قديم) كما كان', readDelivery({}, now).none === true);
ok('اسم اليوم بالعربية', dayLabel('2026-10-04') === 'الأحد 4 أكتوبر', dayLabel('2026-10-04'));

console.log('\n' + '─'.repeat(52));
console.log(`\x1b[1mالنتيجة:\x1b[0m ${fail ? `\x1b[31m${fail} فاشل\x1b[0m / ` : ''}\x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
console.log('─'.repeat(52) + '\n');
process.exit(fail ? 1 : 0);
