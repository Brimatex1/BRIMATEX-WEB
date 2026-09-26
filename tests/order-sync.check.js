#!/usr/bin/env node
// Order stage sync from Odoo - src/lib/orderSync.js
//
// What it guards: the team works in Odoo, so confirming an invoice or recording
// a payment happens there. Before this loop a notification only went out when
// the stage changed from the shop's dashboard - so an order that left for
// delivery in Odoo told the customer nothing.
//
// Everything here runs against a stand-in Odoo client: no network, no server,
// no real invoice.
//
// Runs with the rest: npm test
const { syncOrderStatuses, updatesFromInvoice, updatesFromOrder, stageFromOrder, needsCheck } = require('../src/lib/orderSync');
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

/** An in-memory store and a notification log - same function names as the real ones. */
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
// Older Odoo has no payment_state, so the invoice reads back without the field:
// its absence must never be taken to mean paid.
check('بلا payment_state (أودو قديم) → غير مدفوع', updatesFromInvoice({ state: 'posted' }).paymentStatus === 'unpaid');
check('دفعٌ جزئي ليس مدفوعاً', updatesFromInvoice({ state: 'posted', paymentState: 'partial' }).paymentStatus === 'unpaid');
check('فاتورة معدومة → null', updatesFromInvoice(null) === null);

group('2. أي طلب يُسأل عنه أودو');
check('طلب قيد المراجعة بفاتورة → نعم', needsCheck({ odooInvoiceId: 5, invoiceStatus: 'draft' }, realPush.stageOf));
check('طلب في الطريق → نعم', needsCheck({ odooInvoiceId: 5, invoiceStatus: 'posted' }, realPush.stageOf));
check('طلب مكتمل → لا', !needsCheck({ odooInvoiceId: 5, paymentStatus: 'paid' }, realPush.stageOf));
check('طلب ملغى → لا', !needsCheck({ odooInvoiceId: 5, invoiceStatus: 'cancel' }, realPush.stageOf));
check('طلب تجريبي بلا فاتورة أودو → لا', !needsCheck({ invoiceStatus: 'draft' }, realPush.stageOf));

// The rest is async: Node does not allow await at the top level of a CommonJS file.
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
      1: { state: 'posted', paymentState: 'not_paid' }, // left for delivery
      2: { state: 'posted', paymentState: 'paid' }, // delivered and paid
      3: { state: 'draft', paymentState: 'not_paid' }, // nothing new
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
      11: null, // invoice deleted in Odoo
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

group('7. طلبات الموقع والتطبيق: تتبع الطلب نفسه في أودو');
// The team's steps: confirm the order, validate its delivery when it leaves,
// record the payment on the invoice when the cash comes back.
const SLIP = { name: 'FFG/OUT/00231', doneAt: '2026-09-26T13:33:19.000Z' };
const progress = (state, delivered = 'pending', invoice = null) => ({
  state,
  shipment: delivered === 'full' || delivered === 'partial' ? SLIP : null,
  invoice,
});
check('عرض سعر → قيد المراجعة', stageFromOrder(progress('draft')) === 'review');
check('طلب مؤكَّد → مؤكَّد', stageFromOrder(progress('sale')) === 'confirmed');
check('إذن التسليم تأكّد في المخزن → في الطريق', stageFromOrder(progress('sale', 'full')) === 'shipping');
{
  const u = updatesFromOrder(progress('sale', 'full'));
  check('رقم الإذن وتاريخ الشحن يُحفظان', u.shipmentName === 'FFG/OUT/00231' && u.shippedAt === SLIP.doneAt);
}
check('فاتورة بلا دفع → ما زال في الطريق', stageFromOrder(progress('sale', 'full', { id: 9, name: 'INV/1', state: 'posted', paymentState: 'not_paid' })) === 'shipping');
check('الدفع تسجّل → مكتمل', stageFromOrder(progress('sale', 'full', { id: 9, name: 'INV/1', state: 'posted', paymentState: 'paid' })) === 'done');
check('دفع ينتظر مطابقة البنك → مكتمل', stageFromOrder(progress('sale', 'full', { id: 9, name: 'INV/1', state: 'posted', paymentState: 'in_payment' })) === 'done');
check('طلب ملغى → ملغى', stageFromOrder(progress('cancel')) === 'cancelled');
{
  const u = updatesFromOrder(progress('sale', 'full', { id: 9, name: 'INV/2026/0009', state: 'posted', paymentState: 'not_paid' }));
  check('رقم الفاتورة يُحفظ ليراه الزبون', u.invoiceName === 'INV/2026/0009' && u.odooInvoiceId === 9);
  const draft = updatesFromOrder(progress('sale', 'pending', { id: 9, name: '/', state: 'draft', paymentState: 'not_paid' }));
  check('فاتورة مسوّدة بلا رقم لا تُحفظ', draft.invoiceName === undefined);
  check('وحالاته بمفردات التطبيق', draft.invoiceStatus === 'confirmed' && draft.paymentStatus === 'unpaid');
}
check('طلب له رقم في أودو ولا فاتورة → يُسأل عنه', needsCheck({ odooOrderId: 525, invoiceStatus: 'draft' }, realPush.stageOf));
{
  const h = harness([
    { orderName: 'S00409', odooOrderId: 525, invoiceStatus: 'draft', paymentStatus: 'unpaid' },
    { orderName: 'S00410', odooOrderId: 526, invoiceStatus: 'confirmed', paymentStatus: 'unpaid' },
    { orderName: 'S00411', odooOrderId: 527, invoiceStatus: 'posted', paymentStatus: 'unpaid' },
    { orderName: 'S00412', odooOrderId: 528, invoiceStatus: 'draft', paymentStatus: 'unpaid' },
    { orderName: 'S00413', odooOrderId: 529, invoiceStatus: 'draft', paymentStatus: 'unpaid' },
  ]);
  let rounds = 0;
  const odoo = {
    isConfigured: () => true,
    readInvoice: async () => { throw new Error('يجب ألّا يُنادى'); },
    readOrdersProgress: async (ids) => {
      rounds++;
      const all = {
        525: progress('sale'),
        526: progress('sale', 'full'),
        527: progress('sale', 'full', { id: 40, name: 'INV/2026/0040', state: 'posted', paymentState: 'paid' }),
        528: progress('cancel'),
        // 529 is gone from Odoo.
      };
      return new Map(ids.filter((id) => all[id]).map((id) => [id, all[id]]));
    },
  };
  const summary = await syncOrderStatuses({ odoo, orders: h.orders, push: h.push });
  const stageSent = (name) => h.sent.find((s) => s.orderName === name)?.stage;
  check('كل الطلبات في طلب واحد لأودو', rounds === 1);
  check('تأكيد الطلب → إشعار «تم تأكيد طلبك»', stageSent('S00409') === 'confirmed');
  check('التسليم → إشعار «في الطريق»', stageSent('S00410') === 'shipping');
  check('الدفع → إشعار «تم التسليم»، ورقم الفاتورة', stageSent('S00411') === 'done' && h.store[2].invoiceName === 'INV/2026/0040' && Boolean(h.store[2].paidAt));
  check('الإلغاء → إشعار «أُلغي»', stageSent('S00412') === 'cancelled');
  check('طلب اختفى من أودو يُسجَّل فشلاً ولا يوقف الباقي', summary.failed === 1 && !h.sent.some((s) => s.orderName === 'S00413'));
  const again = await syncOrderStatuses({ odoo, orders: h.orders, push: h.push });
  check('التشغيل التالي صامت', again.changed === 0 && h.sent.length === 4, `changed=${again.changed} sent=${h.sent.length}`);
}
{
  const h = harness([{ orderName: 'S00500', odooOrderId: 600, invoiceStatus: 'draft', paymentStatus: 'unpaid' }]);
  const summary = await syncOrderStatuses({
    odoo: { isConfigured: () => true, readOrdersProgress: async () => { throw new Error('انقطاع شبكة'); } },
    orders: h.orders,
    push: h.push,
  });
  check('أودو لا يرد → فشل مُسجَّل بلا استثناء ولا تحديث', summary.failed === 1 && h.store[0].invoiceStatus === 'draft');
}
{
  const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const h = harness([{ orderName: 'S00050', odooOrderId: 70, placedAt: old, invoiceStatus: 'draft', paymentStatus: 'unpaid' }]);
  await syncOrderStatuses({
    odoo: { isConfigured: () => true, readOrdersProgress: async () => new Map([[70, progress('sale', 'full')]]) },
    orders: h.orders,
    push: h.push,
  });
  check('طلب عمره أكثر من شهر يتحدّث بلا إشعار', h.store[0].invoiceStatus === 'posted' && h.sent.length === 0);
}
{
  const confirmedMsg = realPush.stageOf({ invoiceStatus: 'confirmed' });
  check('«مؤكَّد» مرحلة لها إشعارها، لا «في الطريق»', confirmedMsg === 'confirmed');
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
