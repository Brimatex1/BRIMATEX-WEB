/**
 * How the storefront reads a product from the server: its short name, tier,
 * photo, sizes and heights, and what each size's stock means to a customer.
 * The same rules as the iOS app (brimatex-ios/src/catalog/model.ts). Pure
 * functions - the pages only draw.
 */
import { leadText } from '@/lib/preorder';
import type { Product, ProductVariant } from '@/types';

/** The three tiers sold online, cheapest last on the shelf (Economy is not sold here). */
export type TierKey = 'elite' | 'premium' | 'comfort';
export const TIER_KEYS: TierKey[] = ['elite', 'premium', 'comfort'];
export const TIER_TITLE: Record<TierKey, string> = { elite: 'إليت', premium: 'بريميوم', comfort: 'كمفورت' };

export function isShopTier(key: string | null | undefined): key is TierKey {
  return key === 'elite' || key === 'premium' || key === 'comfort';
}

/** The mattresses the storefront shows: the three tiers only, as the handoff rules. */
export function shopProducts(products: Product[]): Product[] {
  return products.filter((p) => p.enabled !== false && isShopTier(p.tier?.key));
}

/**
 * «مرتبة بالانس» is shown as «بالانس», under the catalogue's names: Odoo still
 * says كومفورت and دايلي, the catalogue (and the 2026 handoff) كمفورت and ديلي.
 */
const CATALOGUE_NAMES: Record<string, string> = { كومفورت: 'كمفورت', دايلي: 'ديلي' };

export function displayName(product: Pick<Product, 'name'>): string {
  const short = product.name.replace(/^مرتبة\s+/, '').trim();
  return CATALOGUE_NAMES[short] ?? short;
}

export function tierOf(product: Product): TierKey | null {
  const key = product.tier?.key;
  return isShopTier(key) ? key : null;
}

/* ───────────── Sizes ───────────── */

export interface SizeParts {
  width: number | null;
  length: number | null;
  /** cm; from the label («H18 / 190*90»), else from the product code (…-H28). */
  height: number | null;
}

const DIMS = /(\d{2,3})\s*[*x×X]\s*(\d{2,3})/;
const HEIGHT = /H\s*(\d{1,3})/i;

export function parseSize(variant: Pick<ProductVariant, 'label' | 'sku'>): SizeParts {
  const dims = String(variant.label || '').match(DIMS) ?? String(variant.sku || '').match(DIMS);
  const h = String(variant.label || '').match(HEIGHT) ?? String(variant.sku || '').match(HEIGHT);
  const a = dims ? Number(dims[1]) : null;
  const b = dims ? Number(dims[2]) : null;
  return {
    width: a !== null && b !== null ? Math.min(a, b) : null,
    length: a !== null && b !== null ? Math.max(a, b) : null,
    height: h ? Number(h[1]) : null,
  };
}

/** «180×200» - the plain text; pages wrap it in <bdi dir="ltr">. */
export function sizeText(parts: { width: number | null; length: number | null }): string {
  if (parts.width === null || parts.length === null) return '';
  return `${parts.width}×${parts.length}`;
}

/** «180x200» in an address (?size=). */
export function sizeParam(parts: { width: number | null; length: number | null }): string {
  return parts.width === null || parts.length === null ? '' : `${parts.width}x${parts.length}`;
}

export function variantsOf(product: Product): ProductVariant[] {
  if (product.variants?.length) return product.variants;
  return [{ id: product.id, label: '', sku: product.sku, price: product.price, stock: product.stock, inStock: product.inStock, preorder: product.preorder }];
}

/** One height for every size (Premium and Elite), or null when it is chosen (Comfort). */
export function fixedHeight(product: Product): number | null {
  const heights = new Set(variantsOf(product).map((v) => parseSize(v).height));
  if (heights.size !== 1) return null;
  const [h] = [...heights];
  return h ?? null;
}

/** Comfort: the heights to choose from, thinnest first. */
export function heightsOf(product: Product): number[] {
  const hs = new Set<number>();
  for (const v of variantsOf(product)) {
    const h = parseSize(v).height;
    if (h !== null) hs.add(h);
  }
  return [...hs].sort((a, b) => a - b);
}

/** The size in the address (?size=180x200&height=24), when this product has it. */
export function variantFromQuery(product: Product, search: string): ProductVariant | null {
  const q = new URLSearchParams(search);
  // ?variant=<id> - the Meta catalogue's links name the size by its id.
  const byId = Number(q.get('variant'));
  if (byId) {
    const v = variantsOf(product).find((x) => x.id === byId);
    if (v) return v;
  }
  const m = q.get('size')?.match(/^(\d{2,3})x(\d{2,3})$/);
  if (!m) return null;
  const width = Number(m[1]);
  const length = Number(m[2]);
  const height = Number(q.get('height')) || null;
  const matches = variantsOf(product).filter((v) => {
    const p = parseSize(v);
    return p.width === width && p.length === length;
  });
  return matches.find((v) => height === null || parseSize(v).height === height) ?? matches[0] ?? null;
}

/* ───────────── Availability ───────────── */

export type Availability = 'ready' | 'limited' | 'preorder' | 'out';

/** A size counts as limited at this many left or fewer. */
const LIMITED_AT = 3;

export function availabilityOf(v: Pick<ProductVariant, 'inStock' | 'stock' | 'preorder'>): Availability {
  if (v.inStock === false) return v.preorder ? 'preorder' : 'out';
  if (typeof v.stock === 'number' && v.stock > 0 && v.stock <= LIMITED_AT) return 'limited';
  return 'ready';
}

export function canOrderVariant(v: Pick<ProductVariant, 'inStock' | 'stock' | 'preorder'>): boolean {
  return availabilityOf(v) !== 'out';
}

export function availabilityText(a: Availability, leadDays?: number | null): string {
  switch (a) {
    case 'ready':
      return 'متوفّر';
    case 'limited':
      return 'كمية محدودة';
    case 'preorder':
      return `طلب مسبق · ${leadText(leadDays)}`;
    case 'out':
      return 'نفد';
  }
}

export type Tone = 'success' | 'warning' | 'info' | 'destructive';

export function availabilityTone(a: Availability): Tone {
  return a === 'ready' ? 'success' : a === 'limited' ? 'warning' : a === 'preorder' ? 'info' : 'destructive';
}

/** The owner's main sizes, in his order (src/lib/sizes.js on the server). */
const MAIN_SIZES: [number, number][] = [
  [90, 190],
  [100, 200],
  [120, 200],
  [160, 200],
  [180, 200],
  [200, 200],
];

/**
 * The size a card and a product page open on: 180×200 when it can be ordered
 * (the size most homes buy, the one the handoff shows), else the first main
 * size that can, else the first.
 */
export function featuredVariant(product: Product): ProductVariant {
  const all = variantsOf(product);
  const orderable = all.filter(canOrderVariant);
  const is = (v: ProductVariant, w: number, l: number) => {
    const p = parseSize(v);
    return p.width === w && p.length === l;
  };
  return orderable.find((v) => is(v, 180, 200)) ?? orderable.find((v) => MAIN_SIZES.some(([w, l]) => is(v, w, l))) ?? orderable[0] ?? all[0];
}

/** «مرتبة نوابض بوسادة علوية، ارتفاع 28 سم» - the line under a name (the size is drawn apart). */
export function describe(product: Product, variant?: ProductVariant): string {
  const v = variant ?? featuredVariant(product);
  const p = parseSize(v);
  return [product.tagline || null, p.height !== null ? `ارتفاع ${p.height} سم` : null].filter(Boolean).join('، ');
}

export function priceFrom(product: Product): number {
  return Math.min(...variantsOf(product).map((v) => v.price));
}

/** Any size of it ready now. */
export function inStockNow(product: Product): boolean {
  return variantsOf(product).some((v) => v.inStock !== false);
}

/** «ارتفاع 28 سم» and the size, for a cart or order line: { size: '180×200', height: 28 }. */
export function lineParts(variant: ProductVariant | undefined): { size: string; height: number | null } {
  if (!variant) return { size: '', height: null };
  const p = parseSize(variant);
  return { size: sizeText(p), height: p.height };
}
