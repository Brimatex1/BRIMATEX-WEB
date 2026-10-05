import { useEffect, useState } from 'react';
import { Check, MessageSquareText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ProductReviews, PublicReview } from '@/types';

import { TIER_TITLE, displayName, lineParts, tierOf } from '../catalog';
import { useTitle } from '../hooks';
import { photoOf } from '../ProductCard';
import { Link } from '../router';
import { lineItem, useShop } from '../state';
import { Container, EmptyState, RatingStars, Skeleton, SizeText } from '../ui';
import { Breadcrumb } from './CategoryPage';

type Filter = 'latest' | 'five' | 'verified';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'latest', label: 'الأحدث' },
  { value: 'five', label: '5 نجوم' },
  { value: 'verified', label: 'مشترٍ مؤكَّد' },
];

export const ASPECTS = [
  { key: 'comfort', label: 'الراحة' },
  { key: 'quality', label: 'الجودة' },
  { key: 'value', label: 'قيمة السعر' },
] as const;

const PAGE = 10;

export function reviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-LY', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** A rating bar; it grows from the start edge once, each a beat after the one before (MOTION.md «Reviews»). */
export function Bar({ value, max, index = 0, tone = 'bg-foreground', className = 'flex-1' }: { value: number; max: number; index?: number; tone?: string; className?: string }) {
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-full bg-image-bg', className)}>
      <span className={cn('block h-full origin-right animate-grow-x rounded-full', tone)} style={{ transform: `scaleX(${max ? value / max : 0})`, animationDelay: `${index * 80}ms` }} />
    </span>
  );
}

function ReviewRow({ review }: { review: PublicReview }) {
  const shop = useShop();
  const size = review.productId ? lineParts(lineItem(shop.find, review.productId).variant).size : '';
  return (
    <article className="grid gap-3 border-b border-border py-7 sm:grid-cols-[180px_1fr] sm:gap-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-start">
        <b className="text-[15px]">{review.name}</b>
        {review.verified !== false ? <span className="inline-flex items-center gap-1 text-[13px] font-bold text-success">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
            مشترٍ مؤكَّد
          </span> : null}
        {size ? (
          <span className="text-[13px] text-muted-foreground">
            المقاس <SizeText>{size}</SizeText>
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-3">
          <RatingStars average={review.rating} count={0} size={16} className="[&>span:last-child]:hidden" />
          <span className="text-xs text-text-tertiary">{reviewDate(review.createdAt)}</span>
        </span>
        {review.title ? <b className="text-[17px]">{review.title}</b> : null}
        {review.comment ? <p className="text-[15px] leading-relaxed">{review.comment}</p> : null}
      </div>
    </article>
  );
}

/**
 * التقييمات (handoff WebReviews): the average, how many gave each number of
 * stars and the comfort / quality / value averages beside the list, with
 * filters and «عرض المزيد». Every review is from a buyer and was moderated.
 */
export function ReviewsPage({ productId }: { productId: number }) {
  const shop = useShop();
  const product = shop.find(productId);
  const [data, setData] = useState<ProductReviews | null>(null);
  const [filter, setFilter] = useState<Filter>('latest');
  const [shown, setShown] = useState(PAGE);
  useTitle(product ? `تقييمات ${displayName(product)}` : 'التقييمات');

  useEffect(() => {
    if (!product) return;
    api
      .getProductReviews(product.id)
      .then(setData)
      .catch(() => setData({ count: 0, average: null, reviews: [] }));
  }, [product]);

  if (!product) {
    return <Container className="py-10">{shop.loading ? <Skeleton className="h-96" /> : <EmptyState icon={<MessageSquareText />} title="لم نجد هذه المرتبة" />}</Container>;
  }

  const tier = tierOf(product);
  const name = displayName(product);
  const sorted = [...(data?.reviews ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const list = filter === 'five' ? sorted.filter((r) => r.rating === 5) : filter === 'verified' ? sorted.filter((r) => r.verified !== false) : sorted;
  const max = Math.max(1, ...Object.values(data?.distribution ?? {}));
  const write = { name: 'reviewWrite' as const, productId: product.id, orderName: null };

  return (
    <Container className="pb-16">
      <Breadcrumb items={[...(tier ? [{ label: TIER_TITLE[tier], to: { name: 'category' as const, tier } }] : []), { label: name, to: { name: 'product', id: product.id } }, { label: 'التقييمات' }]} />
      <div className="mb-8 flex items-center gap-5">
        <img src={photoOf(product, 88)} alt="" className="size-[72px] bg-image-bg object-cover lg:size-[88px]" />
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[28px] font-bold lg:text-[36px]">تقييمات {name}</h1>
          <Link to={{ name: 'product', id: product.id }} className="self-start text-[15px] font-bold underline underline-offset-4">
            العودة إلى المرتبة
          </Link>
        </div>
      </div>

      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[340px_1fr] lg:gap-14">
          <aside className="flex flex-col gap-3 lg:sticky lg:top-40 lg:self-start">
            {data.count ? (
              <>
                <div className="flex items-center gap-4">
                  <b className="font-display text-[56px] leading-none tabular-nums">{data.average?.toFixed(1)}</b>
                  <RatingStars average={data.average ?? 0} count={data.count} size={18} className="[&>span:last-child]:hidden" />
                </div>
                <span className="text-sm text-muted-foreground">
                  <bdi className="tabular-nums">{data.count}</bdi> تقييم
                </span>
                <div className="mt-2 flex flex-col gap-2.5">
                  {[5, 4, 3, 2, 1].map((n, i) => {
                    const c = data.distribution?.[String(n) as '5'] ?? 0;
                    return (
                      <div key={n} className="flex items-center gap-3 text-sm" aria-label={`${n} نجوم: ${c}`}>
                        <span className="w-14 shrink-0">{n} نجوم</span>
                        <Bar value={c} max={max} index={i} />
                        <span className="w-8 text-end tabular-nums text-muted-foreground">{c}</span>
                      </div>
                    );
                  })}
                </div>
                {ASPECTS.some((a) => data.subAverages?.[a.key] !== undefined) ? (
                  <div className="mt-3 flex flex-col gap-3 border-t border-border pt-4">
                    {ASPECTS.map((a, i) => {
                      const v = data.subAverages?.[a.key];
                      if (v === undefined) return null;
                      return (
                        <div key={a.key} className="flex flex-col gap-1.5 text-sm">
                          <span className="flex justify-between">
                            <span>{a.label}</span>
                            <b className="tabular-nums">
                              <bdi dir="ltr">{v.toFixed(1)}/5</bdi>
                            </b>
                          </span>
                          <Bar value={v} max={5} index={5 + i} tone="bg-dark-ocean dark:bg-blue-violet" className="w-full" />
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-[15px] text-muted-foreground">لا توجد تقييمات بعد. يمكن لمن اشترى هذه المرتبة تقييمها بعد استلامها.</p>
            )}
            <Button asChild variant="outline" size="store" className="mt-4">
              <Link to={write}>اكتب تقييماً</Link>
            </Button>
            <span className="text-[13px] text-muted-foreground">يكتب التقييم من اشترى المرتبة فقط، وننشره بعد المراجعة.</span>
          </aside>

          {data.count ? (
            <div className="min-w-0">
              <div role="radiogroup" aria-label="ترتيب التقييمات" className="flex flex-wrap gap-2 border-b border-border pb-5">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="radio"
                    aria-checked={filter === f.value}
                    onClick={() => {
                      setFilter(f.value);
                      setShown(PAGE);
                    }}
                    className={cn('h-10 rounded-full px-5 text-sm font-bold transition-colors', filter === f.value ? 'bg-foreground text-background' : 'bg-image-bg hover:bg-accent')}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {list.length ? (
                list.slice(0, shown).map((r) => <ReviewRow key={r.id} review={r} />)
              ) : (
                <p className="py-10 text-[15px] text-muted-foreground">لا توجد تقييمات بهذا الاختيار.</p>
              )}
              {list.length > shown ? (
                <Button variant="outline" size="store" className="mt-8" onClick={() => setShown((s) => s + PAGE)}>
                  عرض المزيد
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Container>
  );
}
