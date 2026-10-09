import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AdminReview, Product } from '@/types';

import type { PanelMe } from '../api';
import { useQueryUpdater } from '../router';
import { PageBody, PageHeader } from '../Shell';
import { Button, ErrorCard, Icon, Pill, Skeleton, formatPhone, type Tone } from '../ui';

type ReviewState = 'pending' | 'published' | 'hidden';
type Filter = ReviewState | 'all';

const FILTERS: Filter[] = ['all', 'pending', 'published', 'hidden'];

const STATE_META: Record<ReviewState, { chip: string; pill: string; tone: Tone; empty: string }> = {
  pending: { chip: 'بانتظار المراجعة', pill: 'بانتظار المراجعة', tone: 'amber', empty: 'لا تقييمات بانتظار المراجعة.' },
  published: { chip: 'منشورة', pill: 'منشور', tone: 'green', empty: 'لا تقييمات منشورة.' },
  hidden: { chip: 'مخفية', pill: 'مخفي', tone: 'grey', empty: 'لا تقييمات مخفية.' },
};

/** Written and not yet decided on, shown on the product page, or taken off it. */
function stateOf(r: AdminReview): ReviewState {
  if (r.pending) return 'pending';
  return r.hidden ? 'hidden' : 'published';
}

const SUB_RATINGS: { key: 'comfort' | 'quality' | 'value'; label: string }[] = [
  { key: 'comfort', label: 'الراحة' },
  { key: 'quality', label: 'الجودة' },
  { key: 'value', label: 'قيمة السعر' },
];

/**
 * التقييمات - admin only. The classic dashboard's ReviewsPanel in the panel's
 * look: a new review waits here until it is published (only a customer who
 * bought the product can write one); any can be hidden later (a phone number
 * in the text, an insult) and shown again. Those waiting come first; the
 * filter lives in the address (?status=pending), so the overview links to it.
 */
export function ReviewsPage({ me, token, search, onBadgeChange }: { me: PanelMe; token: string; search: string; onBadgeChange: (delta: number) => void }) {
  const filter = useMemo<Filter>(() => {
    const s = new URLSearchParams(search).get('status');
    return FILTERS.includes(s as Filter) ? (s as Filter) : 'all';
  }, [search]);
  const setQuery = useQueryUpdater();

  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.adminReviews(token), api.getProducts().catch(() => ({ products: [] as Product[] }))])
      .then(([r, p]) => {
        setReviews(r.reviews);
        setProducts(p.products);
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);
  useEffect(load, [load]);

  // A review is of the size bought, so a size's id names its product.
  const nameOf = useMemo(() => {
    const names = new Map<number, string>();
    for (const p of products) {
      names.set(p.id, p.name);
      for (const v of p.variants ?? []) names.set(v.id, `${p.name} — ${v.label}`);
    }
    return (id: number) => names.get(id) ?? `منتج #${id}`;
  }, [products]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, pending: 0, published: 0, hidden: 0 };
    for (const r of reviews ?? []) {
      c.all++;
      c[stateOf(r)]++;
    }
    return c;
  }, [reviews]);

  // Those waiting first; otherwise the server's order (newest first).
  const shown = useMemo(
    () =>
      [...(reviews ?? [])]
        .filter((r) => filter === 'all' || stateOf(r) === filter)
        .sort((a, b) => Number(Boolean(b.pending)) - Number(Boolean(a.pending))),
    [reviews, filter]
  );

  async function decide(review: AdminReview, hidden: boolean) {
    setBusy(review.id);
    try {
      await api.adminSetReviewHidden(token, review.id, hidden);
      setReviews((list) => list?.map((r) => (r.id === review.id ? { ...r, hidden, pending: false } : r)) ?? list);
      if (review.pending) onBadgeChange(-1);
      toast.success(hidden ? 'أُخفي التقييم من صفحة المنتج' : 'نُشر التقييم في صفحة المنتج');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader section="reviews" me={me} />
      <PageBody>
        <div className="flex items-start gap-2.5 rounded-xl bg-[#EEF0FA] px-3.5 py-3 text-[13.5px] leading-relaxed text-dark-ocean">
          <Icon name="star" size={18} className="mt-0.5" />
          <span>التقييم الجديد ينتظر موافقتك قبل أن يظهر في صفحة المنتج، ولا يكتبه إلا من اشترى المنتج. انشره، أو أخفِه إن كان فيه رقم هاتف أو كلام غير لائق.</span>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="حالة التقييم">
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setQuery({ status: f === 'all' ? null : f })}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors',
                  active ? 'bg-dark-ocean text-white' : 'bg-white text-[#16161F] shadow-[inset_0_0_0_1px_#E4E6EE] hover:bg-[#F5F6FA]'
                )}
              >
                {f === 'all' ? 'الكل' : STATE_META[f].chip}
                <span className="opacity-70">{reviews ? counts[f] : '–'}</span>
              </button>
            );
          })}
        </div>

        {error ? <ErrorCard message={error} onRetry={load} /> : null}

        {!error || reviews ? (
          <div className="rounded-2xl border border-[#E4E6EE] bg-white p-3">
            <ul className="flex flex-col">
              {!reviews ? (
                Array.from({ length: 4 }, (_, i) => (
                  <li key={i} className="border-t border-[#E4E6EE] p-3 first:border-t-0">
                    <Skeleton className="h-20 w-full" />
                  </li>
                ))
              ) : shown.length === 0 ? (
                <li className="px-3 py-10 text-center text-sm text-[#5F6373]">{filter === 'all' ? 'لا توجد تقييمات بعد.' : STATE_META[filter].empty}</li>
              ) : (
                shown.map((r) => <ReviewRow key={r.id} review={r} product={nameOf(r.productId)} busy={busy === r.id} onDecide={(hidden) => void decide(r, hidden)} />)
              )}
            </ul>
          </div>
        ) : null}
      </PageBody>
    </>
  );
}

function ReviewRow({ review: r, product, busy, onDecide }: { review: AdminReview; product: string; busy: boolean; onDecide: (hidden: boolean) => void }) {
  const state = stateOf(r);
  const subs = SUB_RATINGS.filter((s) => r.subRatings?.[s.key]);
  const date = new Date(r.createdAt);
  return (
    <li
      className={cn(
        'flex flex-col gap-3 border-t border-[#E4E6EE] p-3 first:border-t-0 lg:flex-row lg:items-start lg:gap-6',
        state === 'pending' && 'bg-[#FFFBF0]'
      )}
    >
      {/* The review. */}
      <div className={cn('flex min-w-0 flex-1 flex-col gap-1.5', state === 'hidden' && 'opacity-70')}>
        <div className="flex flex-wrap items-center gap-2.5">
          <Stars value={r.rating} />
          <Pill tone={STATE_META[state].tone}>{STATE_META[state].pill}</Pill>
          {r.reports ? <Pill tone="red">{r.reports === 1 ? 'بلاغ واحد' : `${r.reports} بلاغات`}</Pill> : null}
        </div>
        {r.title ? <b className="text-[15px]">{r.title}</b> : null}
        {r.comment ? <p className="whitespace-pre-line text-sm leading-relaxed text-[#16161F]">{r.comment}</p> : null}
        {subs.length ? (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {subs.map((s) => (
              <span key={s.key} className="rounded-md bg-[#F5F6FA] px-2 py-[3px] text-[12px] font-semibold text-[#3B3E4C]">
                {s.label} {r.subRatings?.[s.key]}/5
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Who, what and when. */}
      <dl className="grid shrink-0 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] lg:w-[300px]">
        <dt className="text-[#5F6373]">المرتبة</dt>
        <dd className="min-w-0 font-semibold">{product}</dd>
        <dt className="text-[#5F6373]">الطلب</dt>
        <dd>
          <bdi dir="ltr">#{r.orderName}</bdi>
        </dd>
        <dt className="text-[#5F6373]">العميل</dt>
        <dd className="flex flex-wrap items-center gap-x-2">
          <span>{r.name || '—'}</span>
          {r.phone ? (
            <bdi dir="ltr" className="text-[#5F6373]">
              {formatPhone(r.phone)}
            </bdi>
          ) : null}
        </dd>
        <dt className="text-[#5F6373]">التاريخ</dt>
        <dd>{Number.isFinite(date.getTime()) ? date.toLocaleDateString('ar-LY', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</dd>
      </dl>

      {/* Publish or hide. */}
      <div className="flex shrink-0 gap-2 lg:w-[120px] lg:flex-col">
        {state === 'pending' ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => onDecide(false)}>
              <Icon name="check" size={17} />
              نشر
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onDecide(true)}>
              <Icon name="eyeOff" size={17} />
              إخفاء
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onDecide(!r.hidden)}>
            <Icon name={r.hidden ? 'eye' : 'eyeOff'} size={17} />
            {r.hidden ? 'إظهار' : 'إخفاء'}
          </Button>
        )}
      </div>
    </li>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${value} من 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={17} className={n <= value ? 'text-[#F2B530]' : 'text-[#D5D7E0]'} fill="currentColor" />
      ))}
    </span>
  );
}
