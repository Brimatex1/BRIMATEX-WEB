/**
 * How a customer receives an order and pays for it - the app's checkout steps
 * (التوصيل، الدفع). Everything is paid on delivery or at the showroom; the
 * method only tells the driver what to bring (cash, a card machine, or the
 * bank details).
 *
 * Delivery days: every day but Friday, morning or evening. Free everywhere
 * for now, as the website says. A day too soon for a pre-order is the app's
 * to prevent (it offers days after the making time); the server checks only
 * that the day is real, not Friday and not past.
 */
'use strict';

const METHODS = { home: 'توصيل إلى المنزل', pickup: 'استلام من الصالة' };
const SLOTS = { morning: 'صباحاً', evening: 'مساءً' };
const PAYMENTS = { cash: 'نقداً', card: 'بطاقة مصرفية', transfer: 'حوالة مصرفية' };

/** Libya is UTC+2 all year. */
const LIBYA_OFFSET_HOURS = 2;
/** The slot's start in Libyan time - Odoo's commitment date is stored in UTC. */
const SLOT_HOUR = { morning: 9, evening: 17 };
/** How far ahead a day can be chosen. */
const MAX_DAYS_AHEAD = 45;
/** The rule above in words, for the panel's «مدن التوصيل» (every city alike). */
const DAYS_TEXT = 'كل الأيام عدا الجمعة، صباحاً أو مساءً';

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
 * paymentMethod, commitmentDate, noteLines } - or { error } in Arabic. An
 * order without them (the website's) is accepted as before: { none: true }.
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
  if (method === 'home') {
    date = String(d.date || '');
    slot = d.slot;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { error: 'اختر يوم التوصيل' };
    if (!SLOTS[slot]) return { error: 'اختر فترة التوصيل' };
    const today = libyaToday(now);
    if (date <= today) return { error: 'اختر يوماً بعد اليوم' };
    const ahead = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
    if (ahead > MAX_DAYS_AHEAD) return { error: 'اختر يوماً أقرب' };
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === 5) return { error: 'لا يوجد توصيل يوم الجمعة' };
    const hourUtc = String(SLOT_HOUR[slot] - LIBYA_OFFSET_HOURS).padStart(2, '0');
    commitmentDate = `${date} ${hourUtc}:00:00`;
    lines.push(`موعد التوصيل: ${dayLabel(date)} · ${SLOTS[slot]}`);
  }
  if (pay) lines.push(`الدفع عند الاستلام: ${PAYMENTS[pay]}`);

  return { method, date, slot, paymentMethod: pay || null, commitmentDate, noteLines: lines };
}

module.exports = { readDelivery, dayLabel, libyaToday, METHODS, SLOTS, PAYMENTS, DAYS_TEXT };
