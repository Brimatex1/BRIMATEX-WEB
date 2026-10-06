// When an order should reach the customer - a date, not a number of days.
//
// The owner's rules: a mattress in stock arrives one to two days after the
// order; a pre-order is made first (its lead days, from the dashboard), then
// the same one to two days. No deliveries on Friday: a delivery day that falls
// on one moves to Saturday. Days are counted on Libya's calendar, whatever the
// visitor's device says.

const TZ = 'Africa/Tripoli';
const DAY_MS = 86_400_000;
const FRIDAY = 5;
/** One to two days after it is ready. */
const DELIVERY_DAYS: [number, number] = [1, 2];

/** Today in Libya, as midnight UTC of that date - day arithmetic without time-zone drift. */
function libyaToday(now: Date): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** `days` delivery days after `from`: Fridays are not counted. */
function addDeliveryDays(from: Date, days: number): Date {
  let date = from;
  let left = days;
  while (left > 0) {
    date = new Date(date.getTime() + DAY_MS);
    if (date.getUTCDay() !== FRIDAY) left--;
  }
  return date;
}

export interface DeliveryWindow {
  from: Date;
  to: Date;
}

/**
 * The window an order should arrive in. `leadDays`: the days to make it - 0
 * or null for a mattress in stock. Making counts every day; delivery skips
 * Fridays.
 */
export function deliveryWindow(leadDays: number | null | undefined, now = new Date()): DeliveryWindow {
  const ready = new Date(libyaToday(now).getTime() + Math.max(0, leadDays ?? 0) * DAY_MS);
  return { from: addDeliveryDays(ready, DELIVERY_DAYS[0]), to: addDeliveryDays(ready, DELIVERY_DAYS[1]) };
}

/**
 * When a size arrives: `days` [from, to] (the catalogue's deliveryDays) after
 * today, Fridays not counted.
 */
export function windowForDays(days: [number, number], now = new Date()): DeliveryWindow {
  const today = libyaToday(now);
  return { from: addDeliveryDays(today, days[0]), to: addDeliveryDays(today, days[1]) };
}

function weekday(date: Date): string {
  return date.toLocaleDateString('ar-LY', { weekday: 'long', timeZone: 'UTC' });
}

function dayMonth(date: Date, withMonth: boolean): string {
  return date.toLocaleDateString('ar-LY', { day: 'numeric', ...(withMonth ? { month: 'long' } : {}), timeZone: 'UTC' });
}

/**
 * "بين الأحد 28 والاثنين 29 سبتمبر" - the month once when both days share it,
 * "بين الأربعاء 30 سبتمبر والخميس 1 أكتوبر" otherwise.
 */
export function windowText({ from, to }: DeliveryWindow): string {
  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  return `بين ${weekday(from)} ${dayMonth(from, !sameMonth)} و${weekday(to)} ${dayMonth(to, true)}`;
}

/** "يوصلك بين الأحد 28 والاثنين 29 سبتمبر" */
export function arrivalText(leadDays: number | null | undefined, now = new Date()): string {
  return `يوصلك ${windowText(deliveryWindow(leadDays, now))}`;
}
