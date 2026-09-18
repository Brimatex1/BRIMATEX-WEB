#!/usr/bin/env node
// مزامنة حالات الطلبات من أودو — src/lib/orderSync.js
//
// الحالة التي يحميها: الفريق يعمل في أودو، فتأكيد الفاتورة أو تسجيل الدفع
// يحدث هناك. قبل هذه الحلقة كان الإشعار يُرسل فقط حين تتغيّر الحالة من لوحة
// إدارة المتجر — فطلبٌ خرج للتوصيل في أودو لا يعرف عنه العميل شيئاً.
//
// كل شيء هنا بعميل أودو مُستعار: لا شبكة، ولا خادم، ولا فاتورة حقيقية.
//
// يشغَّل مع بقية الاختبارات: npm test

const { syncOrderStatuses, updatesFromInvoice, needsCheck } = require('../src/lib/orderSync');
const realPush = require('../src/lib/push');

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

/** متجرٌ في الذاكرة ودفترُ إشعارات — نفس أسماء الدوال الحقيقية. */
function harness(initial) {
  const store = initial.map((o) => ({ ...o }));
  const sent = [];
  return {
    store,
    sent,
    orders: {
      listOrders: async () => store.map((o) => ({ ...o })),
      updateOrder: async (orderName, updates) => {
        const i = store.findIndex((o) => o.orderName === orderName);
        if (i < 0) return null;
        store[i] = { ...store[i], ...updates };
        return { ...store[i] };
      },
    },
    push: {
      stageOf: realPush.stageOf,
      notifyOrderStage: async (before, after) => {
        const stage = realPush.stageOf(after);
        if (stage === realPush.stageOf(before)) return { sent: 0, reason: 'unchanged' };
        sent.push({ orderName: after.orderName, stage });
        return { sent: 1, stage };
      },
    },
  };
}

const odooWith = (byId) => ({
  isConfigured: () => true,
  readInvoice: async (id) => {
    const v = byId[id];
    if (v instanceof Error) throw v;
    return v ?? null;
  },
});

console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — مزامنة حالات الطلبات ═══\x1b[0m');

group('1. ترجمة حالة الفاتورة');
check('مؤكّدة غير مدفوعة → posted/unpaid', (() => {
  const u = updatesFromInvoice({ state: 'posted', paymentState: 'not_paid' });
  return u.invoiceStatus === 'posted' && u.paymentStatus === 'unpaid';
})());
check('مؤكّدة ومدفوعة → posted/paid', (() => {
  const u = updatesFromInvoice({ state: 'posted', paymentState: 'paid' });
  return u.invoiceStatus === 'posted' && u.paymentStatus === 'paid';
})());
check('ملغاة → cancel', updatesFromInvoice({ state: 'cancel', paymentState: 'not_paid' }).invoiceStatus === 'cancel');
check('مسوّدة → draft', updatesFromInvoice({ state: 'draft', paymentState: '' }).invoiceStatus === 'draft');
// أودو القديم لا يملك payment_state، فتُقرأ الفاتورة بلا الحقل: لا يجوز أن
// يُفهم غيابه «مدفوع».
check('بلا payment_state (أودو قديم) → غير مدفوع', updatesFromInvoice({ state: 'posted' }).paymentStatus === 'unpaid');
check('دفعٌ جزئي ليس مدفوعاً', updatesFromInvoice({ state: 'posted', paymentState: 'partial' }).paymentStatus === 'unpaid');
check('فاتورة معدومة → null', updatesFromInvoice(null) === null);

group('2. أي طلب يُسأل عنه أودو');
check('طلب قيد المراجعة بفاتورة → نعم', needsCheck({ odooInvoiceId: 5, invoiceStatus: 'draft' }, realPush.stageOf));
check('طلب في الطريق → نعم', needsCheck({ odooInvoiceId: 5, invoiceStatus: 'posted' }, realPush.stageOf));
check('طلب مكتمل → لا', !needsCheck({ odooInvoiceId: 5, paymentStatus: 'paid' }, realPush.stageOf));
check('طلب ملغى → لا', !needsCheck({ odooInvoiceId: 5, invoiceStatus: 'cancel' }, realPush.stageOf));
check('طلب تجريبي بلا فاتورة أودو → لا', !needsCheck({ invoiceStatus: 'draft' }, realPush.stageOf));

// الباقي غير متزامن: Node لا يقبل await في جذر ملف CommonJS.
async function main() {
group('3. المزامنة تُحدّث وتُشعر');
{
  const h = harness([
    { orderName: 'S00100', odooInvoiceId: 1, invoiceStatus: 'draft', paymentStatus: 'unpaid' },
    { orderName: 'S00101', odooInvoiceId: 2, invoiceStatus: 'posted', paymentStatus: 'unpaid' },
    { orderName: 'S00102', odooInvoiceId: 3, invoiceStatus: 'draft', paymentStatus: 'unpaid' },
  ]);
  const summary = await syncOrderStatuses({
    odoo: odooWith({
      1: { state: 'posted', paymentState: 'not_paid' }, // خرج للتوصيل
      2: { state: 'posted', paymentState: 'paid' }, // سُلّم ودُفع
      3: { state: 'draft', paymentState: 'not_paid' }, // لا جديد
    }),
    orders: h.orders,
    push: h.push,
  });
  check('فُحصت الثلاثة', summary.checked === 3, `checked=${summary.checked}`);
  check('تبدّل اثنان', summary.changed === 2, `changed=${summary.changed}`);
  check('أُرسل إشعاران', summary.notified === 2, `notified=${summary.notified}`);
  check('S00100 → في الطريق', h.sent.some((s) => s.orderName === 'S00100' && s.stage === 'shipping'));
  check('S00101 → مكتمل', h.sent.some((s) => s.orderName === 'S00101' && s.stage === 'done'));
  check('S00102 بلا إشعار', !h.sent.some((s) => s.orderName === 'S00102'));
  check('السجلّ المحلي حُدّث', h.store[0].invoiceStatus === 'posted' && h.store[1].paymentStatus === 'paid');
  check('paidAt كُتب عند الدفع', Boolean(h.store[1].paidAt));
}

group('4. لا إشعار مكرّر على التشغيل التالي');
{
  const h = harness([{ orderName: 'S00200', odooInvoiceId: 7, invoiceStatus: 'draft', paymentStatus: 'unpaid' }]);
  const odoo = odooWith({ 7: { state: 'posted', paymentState: 'not_paid' } });
  const first = await syncOrderStatuses({ odoo, orders: h.orders, push: h.push });
  const second = await syncOrderStatuses({ odoo, orders: h.orders, push: h.push });
  check('الأول يُشعر', first.notified === 1);
  check('الثاني صامت', second.notified === 0 && second.changed === 0, `changed=${second.changed}`);
  check('إشعار واحد فقط في الدفتر', h.sent.length === 1, `عدد=${h.sent.length}`);
}

group('5. الأعطاب لا تُوقف الباقي');
{
  const h = harness([
    { orderName: 'S00300', odooInvoiceId: 10, invoiceStatus: 'draft', paymentStatus: 'unpaid' },
    { orderName: 'S00301', odooInvoiceId: 11, invoiceStatus: 'draft', paymentStatus: 'unpaid' },
    { orderName: 'S00302', odooInvoiceId: 12, invoiceStatus: 'draft', paymentStatus: 'unpaid' },
  ]);
  const summary = await syncOrderStatuses({
    odoo: odooWith({
      10: new Error('انقطاع شبكة'),
      11: null, // فاتورة محذوفة من أودو
      12: { state: 'posted', paymentState: 'paid' },
    }),
    orders: h.orders,
    push: h.push,
  });
  check('فشلان مُسجّلان', summary.failed === 2, `failed=${summary.failed}`);
  check('والثالث نُشر إشعاره', h.sent.some((s) => s.orderName === 'S00302' && s.stage === 'done'));
  check('لم تُرمَ استثناءات', true);
}

group('6. وضعٌ تجريبي بلا أودو');
{
  const h = harness([{ orderName: 'S00400', odooInvoiceId: 1, invoiceStatus: 'draft' }]);
  const summary = await syncOrderStatuses({
    odoo: { isConfigured: () => false, readInvoice: async () => { throw new Error('يجب ألّا يُنادى'); } },
    orders: h.orders,
    push: h.push,
  });
  check('لا فحص ولا إشعار', summary.checked === 0 && summary.notified === 0);
  check('مُعلَّمة كمتخطّاة', summary.skipped === 1);
}

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
}

main();
