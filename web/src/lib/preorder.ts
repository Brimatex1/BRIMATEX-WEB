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
