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
 * - The whole story per mattress, not just a line: the description, then its
 *   features, warranty and layers (the printed catalogue's, src/lib/
 *   productDetails.js) - in plain text for `description`, and as a formatted
 *   list in `rich_text_description`, which Meta shows on the shop's item page.
 * - A product with no picture is left out: Meta rejects an item without one.
 */
'use strict';

const { imageOf } = require('./share');
const { featureLabels } = require('./featureLabels');

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
  'rich_text_description',
  'google_product_category',
  'custom_label_0',
  'custom_label_1',
];

/** Google's taxonomy, which Meta reads too: Furniture > Beds & Accessories > Mattresses. */
const MATTRESS_CATEGORY = 'Furniture > Beds & Accessories > Mattresses';

const PROMISE = 'الدفع عند الاستلام وتوصيل مجاني لباب البيت.';

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * What a mattress is, in words: its description, then the features (the
 * warranty icon aside - it gets its own line), the warranty and the layers.
 */
function storyOf(product) {
  const intro =
    product.description ||
    `مرتبة بريماتكس${product.tier ? ` من فئة ${product.tier.name}` : ''} — صناعة ليبية.`;
  const features = featureLabels((product.iconFeatures || []).filter((k) => !k.startsWith('warranty-')));
  const warranty = product.warrantyYears ? `ضمان المصنع ${product.warrantyYears} سنوات على عيوب التصنيع.` : null;
  const layers = product.layers || [];

  const text = [
    intro,
    features.length ? `المميزات: ${features.join('، ')}.` : null,
    warranty,
    layers.length ? `مكوّنات المرتبة: ${layers.join('، ')}.` : null,
    PROMISE,
  ]
    .filter(Boolean)
    .join(' ');

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    features.length ? `<h3>المميزات</h3><ul>${features.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : '',
    warranty ? `<h3>الضمان</h3><p>${escapeHtml(warranty)}</p>` : '',
    layers.length ? `<h3>مكوّنات المرتبة</h3><ol>${layers.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ol>` : '',
    `<p>${escapeHtml(PROMISE)}</p>`,
  ].join('');

  return { text, html, warranty };
}

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
  const story = storyOf(product);
  const sizes = product.variants ?? [{ id: product.id, label: '', price: product.price, inStock: product.inStock }];
  return sizes.map((v) => ({
    id: v.id,
    item_group_id: product.id,
    title: v.label ? `${product.name} — ${v.label}` : product.name,
    description: story.text,
    // A pre-order (src/lib/preorder.js) is "available for order", which Meta advertises.
    availability: v.inStock !== false ? 'in stock' : v.preorder || (!product.variants && product.preorder) ? 'available for order' : 'out of stock',
    condition: 'new',
    price: money(v.price),
    link,
    image_link: image,
    brand: 'Brimatex',
    product_type: tier,
    size: v.label || '',
    rich_text_description: story.html,
    google_product_category: MATTRESS_CATEGORY,
    // For product sets and ad targeting: the tier, and the warranty in years.
    custom_label_0: product.tier ? product.tier.name : '',
    custom_label_1: product.warrantyYears ? `ضمان ${product.warrantyYears} سنوات` : '',
  }));
}

/** The whole feed as CSV text. `products` is the public catalogue. */
function buildCsv(products, options) {
  const rows = products.flatMap((p) => rowsFor(p, options));
  const lines = [COLUMNS.join(',')];
  for (const row of rows) lines.push(COLUMNS.map((c) => csvCell(row[c])).join(','));
  return { csv: lines.join('\n') + '\n', count: rows.length, skipped: products.filter((p) => !imageOf(p, options.origin)).length };
}

module.exports = { buildCsv, rowsFor, storyOf, COLUMNS };
