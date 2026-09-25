import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';

import { AppCard, SectionTitle } from '@/components/app/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ProductReviews as Reviews } from '@/types';

/** A row of five stars, `value` of them filled (rounded to the nearest half-star's star). */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} من 5`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          style={{ width: size, height: size }}
          className={cn(n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-app-divider text-app-divider')}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * "آراء الزبائن" on the product page - reviews from customers who bought this
 * mattress (the server accepts a review only for a product in the reviewer's
 * own order), newest first, with the average. Nothing shows until there is at
 * least one: an empty "no reviews yet" box sells nothing.
 */
export function ProductReviews({ productId }: { productId: number }) {
  const [data, setData] = useState<Reviews | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    api
      .getProductReviews(productId)
      .then((r) => !cancelled && setData(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!data || data.count === 0 || data.average === null) return null;

  return (
    <AppCard className="mb-4">
      <SectionTitle>آراء الزبائن</SectionTitle>
      <div className="flex items-center gap-3">
        <span className="text-[32px] font-bold leading-none text-app-ocean">{data.average.toFixed(1)}</span>
        <div>
          <Stars value={data.average} size={18} />
          <p className="mt-1 text-sm text-app-muted">
            {data.count === 1 ? 'تقييم واحد' : data.count === 2 ? 'تقييمان' : `${data.count} تقييمات`} من زبائن اشتروها
          </p>
        </div>
      </div>
      <ul className="mt-2">
        {data.reviews.map((r) => (
          <li key={r.id} className="border-t border-app-divider py-3 first:mt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-app-text">{r.name}</span>
              <Stars value={r.rating} size={14} />
            </div>
            {r.comment && <p className="mt-1.5 text-sm leading-6 text-app-text">{r.comment}</p>}
            <p className="mt-1 text-xs text-app-muted">{dateOf(r.createdAt)}</p>
          </li>
        ))}
      </ul>
    </AppCard>
  );
}
