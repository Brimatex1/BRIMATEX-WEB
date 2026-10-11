/**
 * Availability and delivery - the owner's rules, in place of pre-orders.
 *
 * The customer sees every size as available («متوفر») and orders it; no
 * «طلب مسبق», no stock counts. Delivery is the same for every size (handoff,
 * Oct 2026): free and inside Tripoli only, within 48 hours; outside Tripoli the
 * customer collects from an authorized distributor (src/lib/delivery.js).
 *
 * Odoo's stock stays the truth on the server (the raw catalogue, the panel's
 * المراتب and the note): a size not in stock is named in the order's note for
 * the warehouse (stockNote); the customer is not told. The public catalogue -
 * the website, the apps, Meta's feed and the share previews - carries only
 * `inStock: true` and each size's `deliveryDays` / `deliveryText`.
 */
'use strict';

const { productLookup } = require('./catalogue');
const { HOME_TEXT, FIRST_DAY_AHEAD } = require('./delivery');

/** [from, to] for a size - the same 48 hours for every size, in stock or not. */
function deliveryDaysFor() {
  return [FIRST_DAY_AHEAD, FIRST_DAY_AHEAD];
}

/**
 * A size's delivery, as the website and the apps show it: { deliveryDays:
 * [2, 2], deliveryText: «توصيل مجاني داخل طرابلس · خلال 48 ساعة» }.
 */
function delivery() {
  return { deliveryDays: deliveryDaysFor(), deliveryText: HOME_TEXT };
}

/** The public catalogue: every size orderable, with its delivery; the stock itself left out. */
function withAvailability(products) {
  return products.map((p) => ({
    ...p,
    inStock: true,
    stock: null,
    preorder: false,
    leadDays: null,
    // A single-size product's own; one with sizes carries them per size.
    ...delivery(),
    ...(p.variants ? { variants: p.variants.map((v) => ({ ...v, inStock: true, stock: null, preorder: false, ...delivery() })) } : {}),
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
function stockNote(items, products) {
  const byId = productLookup(products);
  const names = items
    .map((i) => byId.get(i.productId))
    .filter((p) => p && p.inStock === false)
    .map((p) => (p.label ? `${p.name} (${p.label})` : p.name));
  if (!names.length) return null;
  return `${NOTE_PREFIX} — يُجهَّز للتوصيل خلال 48 ساعة: ${[...new Set(names)].join('، ')}`;
}

/** Whether an order's note says something in it was not in stock (this note, or an older pre-order's). */
function notInStockFromNote(note) {
  const text = String(note || '');
  return text.includes(`${NOTE_PREFIX} —`) || text.includes('طلب مسبق —');
}

module.exports = { withAvailability, deliveryDaysFor, stockNote, notInStockFromNote, rangeText, NOTE_PREFIX };
