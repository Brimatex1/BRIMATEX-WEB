import type { ProductVariant } from '@/types';

/**
 * A mattress's sizes as a customer chooses them: first the size (90 × 190),
 * then the height (18 سم) - not one grid of thirty "H18 / 190*90" codes.
 *
 * Labels come from Odoo's attributes, e.g. "H18 / 190*100" - the dimensions in
 * either order, the height as H<cm> (the same reading as src/lib/sizes.js on
 * the server). The variants arrive in the owner's order already - main sizes
 * first, thinnest first within each - and that order is kept.
 */

/** [width, length] in cm - the owner's main sizes (src/lib/sizes.js). */
const MAIN_SIZES: [number, number][] = [
  [90, 190],
  [100, 200],
  [120, 200],
  [160, 200],
  [180, 200],
  [200, 200],
];

export interface ParsedSize {
  width: number | null;
  length: number | null;
  height: number | null;
}

export function parseSize(label: string): ParsedSize {
  const text = String(label || '');
  const dims = text.match(/(\d{2,3})\s*[*x×X]\s*(\d{2,3})/);
  const height = text.match(/H\s*(\d{1,3})/i);
  const a = dims ? Number(dims[1]) : null;
  const b = dims ? Number(dims[2]) : null;
  return {
    width: a !== null && b !== null ? Math.min(a, b) : null,
    length: a !== null && b !== null ? Math.max(a, b) : null,
    height: height ? Number(height[1]) : null,
  };
}

/** Where a variant stands for a customer: ready now, made to order, or not at all. */
export type SizeStatus = 'ready' | 'preorder' | 'out';

export function statusOf(v: ProductVariant): SizeStatus {
  if (v.inStock !== false) return 'ready';
  return v.preorder ? 'preorder' : 'out';
}

/** The best of several: one ready thickness makes the size ready. */
function bestStatus(list: ProductVariant[]): SizeStatus {
  const all = list.map(statusOf);
  return all.includes('ready') ? 'ready' : all.includes('preorder') ? 'preorder' : 'out';
}

export interface ThicknessOption {
  /** cm, or null for a size sold in one thickness only. */
  height: number | null;
  variant: ProductVariant;
  status: SizeStatus;
}

export interface SizeOption {
  /** "90x190" - one per width × length. */
  key: string;
  width: number;
  length: number;
  main: boolean;
  status: SizeStatus;
  thicknesses: ThicknessOption[];
}

export interface SizeChoices {
  sizes: SizeOption[];
  /** More than one thickness anywhere: the second step is shown. */
  hasThickness: boolean;
}

/**
 * The two-step choices for a product's variants, or null when a label cannot
 * be read as a size (the page then keeps the plain list of labels).
 */
export function sizeChoices(variants: ProductVariant[]): SizeChoices | null {
  if (variants.length < 2) return null;
  const byKey = new Map<string, SizeOption>();
  for (const v of variants) {
    const { width, length, height: labelHeight } = parseSize(v.label);
    if (width === null || length === null) return null;
    // A label without the height ("90*190") - the product code carries it (BLN-MAT-190x90-H28).
    const height = labelHeight ?? parseSize(v.sku ?? '').height;
    const key = `${width}x${length}`;
    let size = byKey.get(key);
    if (!size) {
      size = {
        key,
        width,
        length,
        main: MAIN_SIZES.some(([w, l]) => w === width && l === length),
        status: 'out',
        thicknesses: [],
      };
      byKey.set(key, size);
    }
    // Two variants on one size and thickness would be ambiguous to choose between.
    if (size.thicknesses.some((t) => t.height === height)) return null;
    size.thicknesses.push({ height, variant: v, status: statusOf(v) });
  }
  const sizes = [...byKey.values()];
  for (const s of sizes) {
    s.thicknesses.sort((x, y) => (x.height ?? 0) - (y.height ?? 0));
    s.status = bestStatus(s.thicknesses.map((t) => t.variant));
  }
  return { sizes, hasThickness: sizes.some((s) => s.thicknesses.length > 1) };
}

/** Which size and thickness a variant is, within the choices. */
export function locate(choices: SizeChoices, variantId: number) {
  for (const size of choices.sizes) {
    const thickness = size.thicknesses.find((t) => t.variant.id === variantId);
    if (thickness) return { size, thickness };
  }
  return null;
}

/**
 * The variant to show when the customer picks another size: the same
 * thickness when that size has it and it can be ordered, else the first
 * ready one, else the first that can be ordered, else the thinnest.
 */
export function variantForSize(size: SizeOption, currentHeight: number | null): ProductVariant {
  const same = size.thicknesses.find((t) => t.height === currentHeight && t.status !== 'out');
  const ready = size.thicknesses.find((t) => t.status === 'ready');
  const orderable = size.thicknesses.find((t) => t.status !== 'out');
  return (same ?? ready ?? orderable ?? size.thicknesses[0]).variant;
}

/** "90 × 190" - width first, as people say it. */
export function sizeName(size: { width: number; length: number }): string {
  return `${size.width} × ${size.length}`;
}

/** "18 سم". */
export function thicknessName(height: number): string {
  return `${height} سم`;
}

/** A variant's label for people: "90 × 190 · ارتفاع 18 سم"; the raw label when unreadable. */
export function friendlySize(label: string): string {
  const { width, length, height } = parseSize(label);
  if (width === null || length === null) return label;
  return height === null ? sizeName({ width, length }) : `${sizeName({ width, length })} · ارتفاع ${thicknessName(height)}`;
}
