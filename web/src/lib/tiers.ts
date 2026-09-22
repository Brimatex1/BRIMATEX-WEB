import type { Product, Tier } from '@/types';

/**
 * The shop's categories are Odoo's: the subcategories of Mattresses
 * (Economy, Comfort, Premium, Elite), which the server sends on each product
 * as `tier` with its Arabic name and its place in the list. Nothing is fixed
 * here, so a tier added in Odoo shows without a release - on the website and
 * in the app alike.
 */

/** A filter value: a tier's key, or every product. */
export type TierFilter = string;
export const ALL_TIERS: TierFilter = 'all';

/** Tiers that have products, in the server's order, each with its products. */
export function tiersOf(products: Product[]): { tier: Tier; items: Product[] }[] {
  const byKey = new Map<string, { tier: Tier; items: Product[] }>();
  for (const p of products) {
    if (!p.tier) continue;
    const entry = byKey.get(p.tier.key) ?? { tier: p.tier, items: [] };
    entry.items.push(p);
    byKey.set(p.tier.key, entry);
  }
  return [...byKey.values()].sort((a, b) => a.tier.rank - b.tier.rank);
}

export function inTier(product: Product, filter: TierFilter): boolean {
  return filter === ALL_TIERS || product.tier?.key === filter;
}

/** What an address may carry as ?category= - a key, never markup. */
export function isTierKey(value: string | null): value is string {
  return Boolean(value && /^[a-z0-9-]{1,40}$/.test(value));
}
