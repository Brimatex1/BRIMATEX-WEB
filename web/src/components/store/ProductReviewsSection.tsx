import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ProductReviews } from '@/types';

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} من 5`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          style={{ width: size, height: size }}
          className={cn(n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted-foreground/30')}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

const dateOf = (iso: string) => new Date(iso).toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * "آراء الزبائن" - reviews from customers who bought this mattress (the
 * server accepts a review only for a product in the reviewer's own order),
 * with the average and how the stars spread. Hidden until there is one.
 */
export function ProductReviewsSection({ productId }: { productId: number }) {
  const [data, setData] = useState<ProductReviews | null>(null);

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
  const spread = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    share: data.reviews.filter((r) => r.rating === stars).length / Math.max(1, data.reviews.length),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">آراء الزبائن</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-8 md:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">{data.average.toFixed(1)}</span>
            <span className="text-sm text-muted-foreground">من 5</span>
          </div>
          <Stars value={data.average} size={18} />
          <p className="text-sm text-muted-foreground">
            {data.count === 1 ? 'تقييم واحد' : data.count === 2 ? 'تقييمان' : `${data.count} تقييمات`} من زبائن اشتروها
          </p>
          <div className="space-y-1.5 pt-2">
            {spread.map((s) => (
              <div key={s.stars} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-3 tabular-nums">{s.stars}</span>
                <Progress value={s.share * 100} className="h-1.5" aria-label={`${s.stars} نجوم`} />
              </div>
            ))}
          </div>
        </div>
        <ul className="divide-y">
          {data.reviews.map((r) => (
            <li key={r.id} className="py-4 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{r.name}</span>
                <Stars value={r.rating} size={14} />
              </div>
              {r.comment && <p className="mt-2 text-sm leading-6">{r.comment}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{dateOf(r.createdAt)}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
