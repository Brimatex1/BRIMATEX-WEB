/**
 * The product feed for Meta's catalogue - GET /feeds/meta-catalog.csv.
 *
 * A catalogue is what lets Facebook and Instagram run dynamic ads: each
 * visitor is shown the mattress they looked at. Meta fetches this file on a
 * schedule (set in Commerce Manager -> Data sources -> Data feed), so it is
 * built fresh from the public catalogue on every request - prices, stock and
 * pictures follow Odoo with no upload step.
 *
 * - One row per size, grouped by item_group_id. The ids are the ones the
 *   Pixel and the Conversions API report (the card's id, a size's id), which
 *   is how Meta ties a visit or a purchase to an item here.
 * - Prices in Libyan dinars, as the site sells them: Commerce Manager takes
 *   LYD for a catalogue, and a catalogue ad shows this price on the ad - a
 *   Libyan customer should read 355 د.ل there, not $44.38. The Pixel still
 *   reports in dollars at the dashboard's rate (src/lib/settings.js): Meta
 *   needs a supported currency to measure value, and it ties an event to an
 *   item here by id, not by currency.
 * - A product with no picture is left out: Meta rejects an item without one.
 */
'use strict';

const { imageOf } = require('./share');

const COLUMNS = [
  'id',
  'item_group_id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'brand',
  'product_type',
  'size',
];

function csvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

function money(lyd) {
  return `${Number(lyd).toFixed(2)} LYD`;
}

/** Rows for one product card: one per size, or the card itself when it has no sizes. */
function rowsFor(product, { origin }) {
  const image = imageOf(product, origin);
  if (!image) return [];
  const link = `${origin}/product/${product.id}`;
  const tier = product.tier ? `مراتب > ${product.tier.name}` : 'مراتب';
  const description =
    product.description ||
    `مرتبة بريماتكس${product.tier ? ` من فئة ${product.tier.name}` : ''} — صناعة ليبية، الدفع عند الاستلام وتوصيل مجاني.`;
  const sizes = product.variants ?? [{ id: product.id, label: '', price: product.price, inStock: product.inStock }];
  return sizes.map((v) => ({
    id: v.id,
    item_group_id: product.id,
    title: v.label ? `${product.name} — ${v.label}` : product.name,
    description,
    availability: v.inStock === false ? 'out of stock' : 'in stock',
    condition: 'new',
    price: money(v.price),
    link,
    image_link: image,
    brand: 'Brimatex',
    product_type: tier,
    size: v.label || '',
  }));
}

/** The whole feed as CSV text. `products` is the public catalogue. */
function buildCsv(products, options) {
  const rows = products.flatMap((p) => rowsFor(p, options));
  const lines = [COLUMNS.join(',')];
  for (const row of rows) lines.push(COLUMNS.map((c) => csvCell(row[c])).join(','));
  return { csv: lines.join('\n') + '\n', count: rows.length, skipped: products.filter((p) => !imageOf(p, options.origin)).length };
}

module.exports = { buildCsv, rowsFor, COLUMNS };
