/**
 * Availability and delivery times - the owner's rule, in place of pre-orders.
 *
 * The customer sees every size as available («متوفر») and orders it; no
 * «طلب مسبق», no stock counts. What differs is how soon it arrives, told as a
 * delivery time and kept to in the delivery days offered:
 *
 * - in stock in Odoo now: `stock` working days (1-3 by default);
 * - not in stock: `made` days (3-5 by default) - the warehouse knows it from
 *   the order's note (stockNote), the customer only sees the later days.
 *
 * Odoo's stock stays the truth on the server (the raw catalogue, the panel's
 * المراتب and the note); the public catalogue - the website, the apps, Meta's
 * feed and the share previews - carries only `inStock: true` and each size's
 * `deliveryDays` [from, to]. The times are the panel's («مدة التوصيل»,
 * src/lib/settings.js readDeliveryTimes).
 */
'use strict';

const { productLookup } = require('./catalogue');

/** [from, to] for a size: in stock now, or not. */
function deliveryDaysFor(inStock, times) {
  return inStock === false ? [...times.made] : [...times.stock];
}

/**
 * A size's delivery, as the website and the apps show it: { deliveryDays:
 * [from, to], deliveryText: «التوصيل خلال 1–3 أيام عمل» }.
 */
function delivery(inStock, times) {
  const days = deliveryDaysFor(inStock ? true : false, times);
  return { deliveryDays: days, deliveryText: `التوصيل خلال ${rangeText(days, inStock)}` };
}

/** The public catalogue: every size orderable, with its delivery days; the stock itself left out. */
function withAvailability(products, times) {
  return products.map((p) => ({
    ...p,
    inStock: true,
    stock: null,
    preorder: false,
    leadDays: null,
    // A single-size product's own; one with sizes carries them per size.
    ...delivery(p.variants?.length ? p.variants.some((v) => v.inStock !== false) : p.inStock !== false, times),
    ...(p.variants ? { variants: p.variants.map((v) => ({ ...v, inStock: true, stock: null, preorder: false, ...delivery(v.inStock !== false, times) })) } : {}),
  }));
}

/** «3–5 أيام» · «1–3 أيام عمل» · «يومين» */
function rangeText([from, to], working = false) {
  const unit = (n) => (n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? 'أيام' : 'يوماً');
  const text = from === to ? (from <= 2 ? unit(from) : `${from} ${unit(from)}`) : `${from}–${to} ${unit(to)}`;
  return working ? `${text} عمل` : text;
}

const NOTE_PREFIX = 'غير متوفر في المخزن';

/**
 * A line for the Odoo order's note naming the sizes not in stock - for the
 * warehouse, never shown to the customer. Null when everything is in stock.
 * `products` is the raw catalogue (its stock), not the public one.
 */
function stockNote(items, products, times) {
  const byId = productLookup(products);
  const names = items
    .map((i) => byId.get(i.productId))
    .filter((p) => p && p.inStock === false)
    .map((p) => (p.label ? `${p.name} (${p.label})` : p.name));
  if (!names.length) return null;
  return `${NOTE_PREFIX} — يُجهَّز للتوصيل خلال ${rangeText(times.made)}: ${[...new Set(names)].join('، ')}`;
}

/** Whether an order's note says something in it was not in stock (this note, or an older pre-order's). */
function notInStockFromNote(note) {
  const text = String(note || '');
  return text.includes(`${NOTE_PREFIX} —`) || text.includes('طلب مسبق —');
}

module.exports = { withAvailability, deliveryDaysFor, stockNote, notInStockFromNote, rangeText, NOTE_PREFIX };
