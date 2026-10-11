/**
 * How a customer receives an order and pays for it - the app's checkout steps
 * (التوصيل، الدفع). Everything is paid on delivery or at the showroom; the
 * method only tells the driver what to bring (cash, a card machine, or the
 * bank details).
 *
 * The owner's rule (handoff, Oct 2026): home delivery is free and only inside
 * Tripoli, within 48 hours of the order - the first day offered is two days
 * after today; then every day but Friday, morning or evening. Outside Tripoli
 * the customer collects the order free from an authorized distributor
 * (src/lib/distributors.js). Pickup at the branch (الفرع) is free too.
 */
'use strict';

const { isTripoli } = require('./distributors');

const METHODS = { home: 'توصيل إلى المنزل', pickup: 'استلام من الفرع', distributor: 'استلام من موزّع معتمد' };
const SLOTS = { morning: 'صباحاً', evening: 'مساءً' };
const PAYMENTS = { cash: 'نقداً', card: 'بطاقة مصرفية', transfer: 'حوالة مصرفية' };

/** Libya is UTC+2 all year. */
const LIBYA_OFFSET_HOURS = 2;
/** The slot's start in Libyan time - Odoo's commitment date is stored in UTC. */
const SLOT_HOUR = { morning: 9, evening: 17 };
/** Home delivery: within 48 hours, so the first day is two days after today. */
const FIRST_DAY_AHEAD = 2;
/** How far ahead a day can be chosen. */
const MAX_DAYS_AHEAD = 45;
/** The rule above in words, for the panel's «مدن التوصيل». */
const DAYS_TEXT = 'داخل طرابلس خلال 48 ساعة، كل الأيام عدا الجمعة، صباحاً أو مساءً';
/** What the website and the apps say about delivery, everywhere the same. */
const HOME_TEXT = 'توصيل مجاني داخل طرابلس · خلال 48 ساعة';

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** Today's date in Libya, YYYY-MM-DD. */
function libyaToday(now = new Date()) {
  return new Date(now.getTime() + LIBYA_OFFSET_HOURS * 3600_000).toISOString().slice(0, 10);
}

/** «السبت 3 أكتوبر» */
function dayLabel(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * The order's delivery and payment, checked: { method, date, slot,
 * distributorId, paymentMethod, commitmentDate, noteLines } - or { error } in
 * Arabic. An order without them (an old client's) is accepted as before:
 * { none: true }. The distributor itself is checked by the orders route, which
 * can ask Odoo (src/lib/distributors.js); here only its id is read.
 */
function readDelivery(order, now = new Date()) {
  const d = order?.delivery;
  const pay = order?.paymentMethod;
  if (d == null && pay == null) return { none: true };

  const method = d?.method;
  if (!METHODS[method]) return { error: 'اختر طريقة الاستلام' };
  if (pay != null && !PAYMENTS[pay]) return { error: 'طريقة الدفع غير معروفة' };

  const lines = [`الاستلام: ${METHODS[method]}`];
  let date = null;
  let slot = null;
  let commitmentDate = null;
  let distributorId = null;
  if (method === 'home' && !isTripoli(order?.customer?.city)) {
    return { error: 'التوصيل إلى المنزل داخل طرابلس فقط. اختر الاستلام من موزّع معتمد', code: 'home_outside_tripoli' };
  }
  if (method === 'distributor') {
    distributorId = d.distributorId == null ? null : Number(d.distributorId);
    if (distributorId !== null && (!Number.isInteger(distributorId) || distributorId <= 0)) return { error: 'اختر الموزّع' };
  }
  if (method === 'home') {
    date = String(d.date || '');
    slot = d.slot;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { error: 'اختر يوم التوصيل' };
    if (!SLOTS[slot]) return { error: 'اختر فترة التوصيل' };
    const today = libyaToday(now);
    const ahead = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
    if (ahead < FIRST_DAY_AHEAD) return { error: 'يصل الطلب داخل طرابلس خلال 48 ساعة. اختر يوماً بعد يومين' };
    if (ahead > MAX_DAYS_AHEAD) return { error: 'اختر يوماً أقرب' };
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === 5) return { error: 'لا يوجد توصيل يوم الجمعة' };
    const hourUtc = String(SLOT_HOUR[slot] - LIBYA_OFFSET_HOURS).padStart(2, '0');
    commitmentDate = `${date} ${hourUtc}:00:00`;
    lines.push(`موعد التوصيل: ${dayLabel(date)} · ${SLOTS[slot]}`);
  }
  if (pay) lines.push(`الدفع عند الاستلام: ${PAYMENTS[pay]}`);

  return { method, date, slot, distributorId, paymentMethod: pay || null, commitmentDate, noteLines: lines };
}

module.exports = { readDelivery, dayLabel, libyaToday, METHODS, SLOTS, PAYMENTS, DAYS_TEXT, HOME_TEXT, FIRST_DAY_AHEAD };
