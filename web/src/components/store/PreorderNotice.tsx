import { Factory } from 'lucide-react';

import { leadText } from '@/lib/preorder';
import { cn } from '@/lib/utils';
import type { CartLine } from '@/types';

/**
 * Said before the customer confirms: which mattresses in the order are made
 * to order, and how long that takes - a pre-order must never be a surprise
 * at the door.
 */
export function PreorderNotice({
  items,
  className,
}: {
  items: { line: CartLine; leadDays: number | null }[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div role="note" className={cn('flex gap-3 rounded-lg border border-accent/60 bg-accent/15 p-4 text-sm', className)}>
      <Factory className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="space-y-1.5">
        <p className="font-semibold">{items.length === 1 ? 'في طلبك مرتبة طلب مسبق' : 'في طلبك مراتب طلب مسبق'}</p>
        <ul className="space-y-0.5">
          {items.map(({ line, leadDays }) => (
            <li key={line.id}>
              {line.name} — <strong>{leadText(leadDays)}</strong>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          تُصنع خصيصاً لك بعد الطلب، ويتصل بك فريقنا لتأكيد موعد التوصيل. الدفع عند الاستلام كالعادة.
        </p>
      </div>
    </div>
  );
}

/** A short tag under a cart line that is a pre-order. */
export function PreorderTag({ leadDays }: { leadDays: number | null }) {
  return (
    <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-accent/25 px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
      <Factory className="size-3" aria-hidden="true" />
      طلب مسبق · {leadText(leadDays)}
    </span>
  );
}
