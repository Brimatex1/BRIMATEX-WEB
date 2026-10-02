import { useEffect, useId, useState } from 'react';
import { MessageSquareText, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { OrderSummary, Product } from '@/types';

import { describe, displayName, lineParts } from '../catalog';
import { useTitle } from '../hooks';
import { isCancelled } from '../orders';
import { photoOf } from '../ProductCard';
import { Link, useRouter } from '../router';
import { lineItem, useShop } from '../state';
import { AFTER_MARK, Container, EmptyState, RatingStars, SizeText, Skeleton, StatusDot, SuccessMark } from '../ui';
import { useMyOrders } from '../account/AccountLayout';
import { Breadcrumb } from './CategoryPage';
import { ASPECTS, reviewDate } from './ReviewsPage';

const WORDS = ['', 'سيئة', 'مقبولة', 'جيدة', 'جيدة جداً', 'ممتازة'];

type Aspect = (typeof ASPECTS)[number]['key'];

/** Five stars as a radio group: arrows move, a click picks. */
function StarInput({ value, onChange, size, label }: { value: number; onChange: (n: number) => void; size: number; label: string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} من 5`}
          tabIndex={value === n || (!value && n === 1) ? 0 : -1}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          onKeyDown={(e) => {
            // In RTL the next star is to the left.
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') onChange(Math.min(5, (value || 0) + 1));
            else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') onChange(Math.max(1, (value || 2) - 1));
            else return;
            e.preventDefault();
          }}
          className="grid place-items-center rounded-md p-0.5 transition-transform duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-90 motion-reduce:transition-none"
        >
          <Star style={{ width: size, height: size }} strokeWidth={1.6} className={n <= shown ? 'fill-foreground text-foreground' : 'text-foreground'} aria-hidden />
        </button>
      ))}
    </div>
  );
}

/** The customer's orders of this mattress that may still be reviewed (not cancelled, not yet reviewed). */
function reviewable(orders: OrderSummary[], productId: number, find: ReturnType<typeof useShop>['find'], done: Set<string>) {
  const out: { order: OrderSummary; itemId: number }[] = [];
  for (const order of orders) {
    if (isCancelled(order)) continue;
    const item = order.items.find((i) => lineItem(find, i.productId).product?.id === productId);
    if (!item) continue;
    if (done.has(`${order.orderName}:${item.productId}`) || done.has(`${order.orderName}:${productId}`)) continue;
    out.push({ order, itemId: item.productId });
  }
  return out;
}

/**
 * اكتب تقييماً (handoff WebReviewWrite): the overall stars, comfort, quality
 * and value, a title and the text. Only a buyer can write one - of a mattress
 * from one of their orders - and it is published after review
 * (reference-ios ReviewPending).
 */
export function ReviewWritePage({ productId, orderName }: { productId: number; orderName: string | null }) {
  const shop = useShop();
  const { go } = useRouter();
  const product = shop.find(productId);
  useTitle('اكتب تقييماً');
  const user = shop.auth.user;

  useEffect(() => {
    if (!shop.auth.checking && !user) shop.requireLogin('account');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop.auth.checking, user]);

  const crumbs = [{ label: 'حسابي', to: { name: 'account' as const, section: 'orders' as const } }, { label: 'اكتب تقييماً' }];

  if (!user) {
    return (
      <Container className="pb-16">
        <Breadcrumb items={crumbs} />
        <EmptyState icon={<MessageSquareText />} title={shop.auth.checking ? 'جارٍ التحميل…' : 'سجّل الدخول لكتابة تقييم'} body={shop.auth.checking ? undefined : 'يكتب التقييم من اشترى المرتبة فقط.'} action={shop.auth.checking ? undefined : 'تسجيل الدخول'} onAction={() => shop.requireLogin('account')} />
      </Container>
    );
  }
  if (!product) {
    return <Container className="py-10">{shop.loading ? <Skeleton className="h-96" /> : <EmptyState icon={<MessageSquareText />} title="لم نجد هذه المرتبة" />}</Container>;
  }
  return (
    <Container className="pb-16">
      <Breadcrumb items={crumbs} />
      <WriteForm key={product.id} product={product} orderName={orderName} onBack={() => go({ name: 'product', id: product.id })} />
    </Container>
  );
}

function WriteForm({ product, orderName, onBack }: { product: Product; orderName: string | null; onBack: () => void }) {
  const shop = useShop();
  const token = shop.auth.token;
  const { orders } = useMyOrders();
  const [done, setDone] = useState<Set<string> | null>(null);
  const [rating, setRating] = useState(0);
  const [aspects, setAspects] = useState<Partial<Record<Aspect, number>>>({});
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const errorId = useId();

  useEffect(() => {
    if (!token) return;
    api
      .myReviews(token)
      .then(({ reviews }) => setDone(new Set(reviews.map((r) => `${r.orderName}:${r.productId}`))))
      .catch(() => setDone(new Set()));
  }, [token]);

  if (!orders || !done) return <Skeleton className="h-96 max-w-3xl" />;

  const options = reviewable(orders, product.id, shop.find, done);
  const pick = options.find((o) => o.order.orderName === orderName) ?? options[0];
  const name = displayName(product);

  if (sent) {
    return (
      <div className="flex max-w-xl flex-col items-start gap-5 py-6">
        <SuccessMark solid />
        <h1 className={cn('font-display text-[28px] font-bold lg:text-[36px]', AFTER_MARK)}>شكراً لتقييمك</h1>
        <p className={cn('text-[15px] text-muted-foreground', AFTER_MARK)}>نراجع التقييمات قبل نشرها، وسيظهر تقييمك على صفحة المرتبة بعد الموافقة عليه.</p>
        <div className={cn('flex w-full items-center gap-4 rounded-lg border border-border p-4', AFTER_MARK)}>
          <img src={photoOf(product)} alt="" className="size-16 bg-image-bg object-cover" />
          <span className="flex flex-1 flex-col gap-1">
            <b className="text-[15px]">{name}</b>
            <RatingStars average={rating} count={0} className="[&>span:last-child]:hidden" />
          </span>
          <StatusDot tone="warning">قيد المراجعة</StatusDot>
        </div>
        <div className={cn('flex flex-wrap items-center gap-4', AFTER_MARK)}>
          <Button size="store" onClick={onBack}>
            العودة إلى المرتبة
          </Button>
          <Link to={{ name: 'account', section: 'orders' }} className="text-[15px] font-bold underline underline-offset-4">
            قيّم مرتبة أخرى
          </Link>
        </div>
      </div>
    );
  }

  if (!pick) {
    return (
      <EmptyState
        icon={<MessageSquareText />}
        title={orders.some((o) => o.items.some((i) => lineItem(shop.find, i.productId).product?.id === product.id)) ? `قيّمت ${name} من قبل` : `لم تشترِ ${name} بعد`}
        body="يكتب التقييم من اشترى المرتبة فقط، ومرة واحدة لكل طلب."
        action="العودة إلى المرتبة"
        onAction={onBack}
      />
    );
  }

  const { size } = lineParts(lineItem(shop.find, pick.itemId).variant);

  async function submit() {
    if (!token || !pick) return;
    if (!rating) return setError('اختر تقييمك العام من 1 إلى 5 نجوم.');
    if (text.trim().length < 5) return setError('اكتب تقييمك في كلمات قليلة على الأقل.');
    setBusy(true);
    setError(null);
    try {
      await api.postReview(token, { productId: pick.itemId, orderName: pick.order.orderName, rating, title: title.trim(), comment: text.trim(), subRatings: aspects });
      setSent(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إرسال التقييم');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex max-w-3xl flex-col gap-7"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h1 className="font-display text-[28px] font-bold lg:text-[40px]">اكتب تقييماً</h1>

      <div className="flex items-center gap-4 bg-image-bg p-4">
        <img src={photoOf(product)} alt="" className="size-[72px] object-cover" />
        <span className="flex flex-col gap-1">
          <b className="text-base">{name}</b>
          <span className="text-[13px] text-muted-foreground">
            {describe(product)}
            {size ? (
              <>
                {describe(product) ? '، ' : ''}
                <SizeText>{size}</SizeText>
              </>
            ) : null}{' '}
            · اشتريتها في {reviewDate(pick.order.placedAt)}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <b className="text-lg">تقييمك العام</b>
        <span className="flex items-center gap-4">
          <StarInput
            value={rating}
            onChange={(n) => {
              setRating(n);
              setError(null);
            }}
            size={36}
            label="تقييمك العام"
          />
          <b className="w-20 text-[15px]" aria-live="polite">
            {WORDS[rating]}
          </b>
        </span>
      </div>

      <div className="flex flex-col gap-4 border-b border-border pb-6">
        {ASPECTS.map((a) => (
          <div key={a.key} className="flex items-center justify-between gap-4">
            <b className="text-[15px]">{a.label}</b>
            <StarInput value={aspects[a.key] ?? 0} onChange={(n) => setAspects((s) => ({ ...s, [a.key]: n }))} size={24} label={a.label} />
          </div>
        ))}
      </div>

      <label className="flex flex-col gap-2">
        <b className="text-[15px]">عنوان التقييم</b>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="مثلاً: تحسّن نومي منذ الأسبوع الأول" className="h-[52px] rounded-lg border border-input bg-background px-4 text-base outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-ring" />
      </label>

      <label className="flex flex-col gap-2">
        <b className="text-[15px]">تقييمك</b>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={1000}
          aria-describedby={error ? errorId : undefined}
          placeholder="حدّثنا عن تجربتك مع المرتبة…"
          className="rounded-lg border border-input bg-background p-4 text-base outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="store" loading={busy}>
          انشر التقييم
        </Button>
        <span className="text-sm text-muted-foreground">ننشر التقييم بعد المراجعة.</span>
      </div>
    </form>
  );
}
