/**
 * Pre-orders: a mattress out of stock in Odoo that can still be ordered,
 * because the factory makes it to order (the dashboard switches this on,
 * src/lib/settings.js). Stock in Odoo stays the truth - a product is marked,
 * never shown as in stock:
 *
 * - `preorder: true` on a card or size that is out of stock while pre-orders
 *   are on, and `leadDays` (null when unset) on every card - the website and
 *   the app offer "order now, made in N days" instead of "out of stock";
 * - Meta's feed lists it as "available for order", which Meta advertises
 *   (src/lib/metaFeed.js), where "out of stock" it does not;
 * - the Odoo order carries a note naming what has to be made (preorderNote).
 */
'use strict';

const { productLookup } = require('./catalogue');

/** The public catalogue with the pre-order marks. `config` is settings.readPreorder(). */
function withPreorder(products, config) {
  const on = Boolean(config?.enabled);
  const leadDays = on ? config.days ?? null : null;
  return products.map((p) => ({
    ...p,
    preorder: on && p.inStock === false,
    leadDays,
    ...(p.variants
      ? { variants: p.variants.map((v) => ({ ...v, preorder: on && v.inStock === false })) }
      : {}),
  }));
}

/** How long making it takes, in words - "خلال 7 أيام", or "على الطلب" when unset. */
function leadText(days) {
  if (!days) return 'يُصنع على الطلب';
  if (days === 1) return 'يُصنع خلال يوم';
  if (days === 2) return 'يُصنع خلال يومين';
  if (days <= 10) return `يُصنع خلال ${days} أيام`;
  return `يُصنع خلال ${days} يوماً`;
}

/**
 * A line for the Odoo order's note when it holds sizes out of stock - so the
 * team knows before calling that these are to be made. Null when none are, or
 * pre-orders are off.
 */
function preorderNote(items, products, config) {
  if (!config?.enabled) return null;
  const byId = productLookup(products);
  const names = items
    .map((i) => byId.get(i.productId))
    .filter((p) => p && p.inStock === false)
    .map((p) => (p.label ? `${p.name} (${p.label})` : p.name));
  if (!names.length) return null;
  return `طلب مسبق — ${leadText(config.days)}: ${[...new Set(names)].join('، ')}`;
}

module.exports = { withPreorder, preorderNote, leadText };
