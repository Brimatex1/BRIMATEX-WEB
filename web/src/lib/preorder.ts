// Pre-orders (src/lib/preorder.js on the server): with them on in the
// dashboard, a mattress out of stock in Odoo is still orderable - the factory
// makes it to order - and the server marks it `preorder`.

import type { Product, ProductVariant } from '@/types';

/** Can this card or size be ordered - in stock, or a pre-order? */
export function canOrder(item: Pick<Product, 'inStock' | 'preorder'> | ProductVariant): boolean {
  return item.inStock !== false || item.preorder === true;
}

/** How long making it takes, in words - the server's leadText, word for word. */
export function leadText(days: number | null | undefined): string {
  if (!days) return 'يُصنع على الطلب';
  if (days === 1) return 'يُصنع خلال يوم';
  if (days === 2) return 'يُصنع خلال يومين';
  if (days <= 10) return `يُصنع خلال ${days} أيام`;
  return `يُصنع خلال ${days} يوماً`;
}

/** The size a cart line holds (or the card itself, for a product with no sizes). */
function itemOf(products: Product[], id: number): { preorder: boolean; leadDays: number | null } | null {
  for (const p of products) {
    const size = (p.variants ?? []).find((v) => v.id === id);
    if (size) return { preorder: size.preorder === true, leadDays: p.leadDays ?? null };
    if (p.id === id) return { preorder: p.preorder === true, leadDays: p.leadDays ?? null };
  }
  return null;
}

/**
 * The cart lines that are pre-orders, read from the current catalogue - not
 * from the line, which may be days old - with how long each takes.
 */
export function preorderLines<T extends { id: number }>(lines: T[], products: Product[]): { line: T; leadDays: number | null }[] {
  return lines.flatMap((line) => {
    const item = itemOf(products, line.id);
    return item?.preorder ? [{ line, leadDays: item.leadDays }] : [];
  });
}
