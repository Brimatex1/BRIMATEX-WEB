import type { Product } from '@/types';

import { displayName, parseSize, sizeParam, variantsOf } from './catalog';

/**
 * Marketing links - /p/<slug>[?variant=<id>] - from the banners
 * (Brimatex-Banners/banners.json) and ads: a mattress by a short English
 * name instead of its Odoo id. The slug finds the product by its Odoo
 * template (stable across renames), else by its name; the variant becomes
 * the product page's ?size= (and ?height=).
 */
export const MARKETING_SLUGS: Record<string, { templateId: number | null; name: string }> = {
  deluxe: { templateId: 4792, name: 'ديلوكس' },
  balance: { templateId: 5012, name: 'بالانس' },
  hotel: { templateId: 4773, name: 'هوتيل' },
  comfort: { templateId: 4776, name: 'كمفورت' },
  sport: { templateId: 4973, name: 'سبورت' },
  classic: { templateId: 4782, name: 'كلاسيك' },
  daily: { templateId: 4779, name: 'ديلي' },
  // Not mapped to an Odoo template yet - found by its name.
  crown: { templateId: null, name: 'كراون' },
};

/** The product a slug names, or undefined (an unknown slug, or not in the catalogue). */
export function productForSlug(slug: string, products: Product[]): Product | undefined {
  const entry = MARKETING_SLUGS[slug];
  if (!entry) return undefined;
  return (
    (entry.templateId !== null ? products.find((p) => p.templateId === entry.templateId) : undefined) ??
    products.find((p) => displayName(p) === entry.name) ??
    // Demo catalogues name them «ديلوكس برايم - حجم 150×190».
    products.find((p) => displayName(p).startsWith(entry.name))
  );
}

/** /p/<slug>?variant=<id> → /product/<id>?size=180x200[&height=28], or null when the product is not found. */
export function productHrefForSlug(slug: string, variantId: number | null, products: Product[]): string | null {
  const product = productForSlug(slug, products);
  if (!product) return null;
  const variant = variantId !== null ? variantsOf(product).find((v) => v.id === variantId) : undefined;
  if (!variant) return `/product/${product.id}`;
  const parts = parseSize(variant);
  const size = sizeParam(parts);
  if (!size) return `/product/${product.id}`;
  // The height only when the sizes differ in it (Comfort) - as the product page writes it.
  const heights = new Set(variantsOf(product).map((v) => parseSize(v).height));
  const height = parts.height !== null && heights.size > 1 ? `&height=${parts.height}` : '';
  return `/product/${product.id}?size=${size}${height}`;
}

/** A banner's link as the shop links it: a /p/ link becomes the product's own address once the catalogue is in. */
export function resolveMarketingLink(link: string, products: Product[]): string {
  const m = link.match(/^\/p\/([a-z0-9-]+)(?:\?(.*))?$/);
  if (!m) return link;
  const variant = Number(new URLSearchParams(m[2] ?? '').get('variant'));
  return productHrefForSlug(m[1], Number.isInteger(variant) && variant > 0 ? variant : null, products) ?? link;
}
