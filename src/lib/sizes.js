/**
 * The order sizes are shown in - on the site, in the app, in Meta's catalogue
 * and in what the Pixel reports as the size viewed.
 *
 * The owner's main sizes come first, in this order: 90×190, 100×200, 120×200,
 * 160×200, 180×200, 200×200 - within each, thinnest first (H18, H24, H28).
 * Every other size follows, narrowest first. The first size is the one a
 * product page opens on.
 *
 * Labels come from Odoo's attributes, e.g. "H18 / 190*100" - the dimensions in
 * either order, the height as H<cm>.
 */
'use strict';

/** [width, length] in cm - the main sizes, in the owner's order. */
const MAIN_SIZES = [
  [90, 190],
  [100, 200],
  [120, 200],
  [160, 200],
  [180, 200],
  [200, 200],
];

/** { width, length, height } from a label; any part missing is null. */
function parseSize(label) {
  const text = String(label || '');
  const dims = text.match(/(\d{2,3})\s*[*x×X]\s*(\d{2,3})/);
  const height = text.match(/H\s*(\d{1,3})/i);
  const [a, b] = dims ? [Number(dims[1]), Number(dims[2])] : [null, null];
  return {
    width: dims ? Math.min(a, b) : null,
    length: dims ? Math.max(a, b) : null,
    height: height ? Number(height[1]) : null,
  };
}

/** Where a main size stands in the owner's list; -1 for any other size. */
function mainIndex(label) {
  const { width, length } = parseSize(label);
  return MAIN_SIZES.findIndex(([w, l]) => w === width && l === length);
}

function isMainSize(label) {
  return mainIndex(label) !== -1;
}

/** Sorts sizes (objects with a `label`) - main sizes first; a new array. */
function sortSizes(sizes) {
  const key = (v) => {
    const main = mainIndex(v.label);
    const { width, length, height } = parseSize(v.label);
    return [main === -1 ? MAIN_SIZES.length : main, width ?? 9999, length ?? 9999, height ?? 9999];
  };
  return sizes
    .map((v, i) => ({ v, i, k: key(v) }))
    .sort((x, y) => {
      for (let n = 0; n < x.k.length; n++) if (x.k[n] !== y.k[n]) return x.k[n] - y.k[n];
      return x.i - y.i; // same size and height: Odoo's order
    })
    .map(({ v }) => v);
}

module.exports = { MAIN_SIZES, parseSize, isMainSize, sortSizes };
