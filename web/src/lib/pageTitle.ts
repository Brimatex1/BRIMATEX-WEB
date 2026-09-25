import type { Product, SectionId } from '@/types';
import { tiersOf } from '@/lib/tiers';

/**
 * Page titles, worded the way Libyans search: in Arabic, with "مراتب" /
 * "مرتبة" in them - Odoo's product names are English ("Comfort Mattress"), which
 * nobody types. Search engines run this code, so the title set here is the
 * one they keep.
 *
 * The server writes the same titles into the page it sends (src/lib/share.js)
 * for crawlers that run no JavaScript; change both together.
 */
export const HOME_TITLE = 'بريماتكس — مراتب صناعة ليبية | الدفع عند الاستلام';
export const SHOP_TITLE = 'مراتب للبيع في ليبيا — بريماتكس';

export function productTitle(product: Product): string {
  const kind = product.tier ? `مرتبة ${product.tier.name}` : 'مرتبة';
  return `${product.name} — ${kind} | بريماتكس`;
}

export function tierTitle(tierName: string): string {
  return `مراتب ${tierName} — بريماتكس`;
}

/** The title for what is on screen. */
export function titleFor(
  section: SectionId,
  { product, category, products }: { product: Product | null; category: string; products: Product[] }
): string {
  if (section === 'product' && product) return productTitle(product);
  if (section === 'shop') {
    const tier = tiersOf(products).find((t) => t.tier.key === category)?.tier;
    return tier ? tierTitle(tier.name) : SHOP_TITLE;
  }
  return HOME_TITLE;
}
