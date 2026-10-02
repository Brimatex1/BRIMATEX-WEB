import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, Copy, Package, Star } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn, formatPrice } from '@/lib/utils';
import type { Coupon, CouponsResponse, LoyaltyHistoryEntry } from '@/types';

import { useTitle } from '../hooks';
import { CouponCodeForm, CouponIcon, couponsText, formatPoints, longDate, PointsIcon } from '../loyalty';
import { Link } from '../router';
import { useShop } from '../state';
import { EmptyState, Skeleton } from '../ui';
import { AccountLayout } from './AccountLayout';

function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 pb-6">
      <h1 className="font-display text-[28px] font-bold lg:text-[40px]">{title}</h1>
      <span className="text-[15px] text-muted-foreground">{sub}</span>
    </div>
  );
}

/** The program is off, or the server could not be reached: no numbers, never made-up ones. */
function Unavailable({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return failed ? (
    <EmptyState icon={<PointsIcon />} title="تعذّر تحميل نقاطك" body="تحقّق من الاتصال ثم حاول مجدداً." action="إعادة المحاولة" onAction={onRetry} />
  ) : (
    <EmptyState icon={<PointsIcon />} title="النقاط والقسائم غير متاحة حالياً" body="سنُعلمك حين يبدأ برنامج النقاط." />
  );
}

/** «طلب #S00431» with the order number kept left to right («#» stays before it). */
function labelOf(entry: LoyaltyHistoryEntry) {
  const tag = entry.orderName ? `#${entry.orderName}` : null;
  const at = tag ? entry.label.indexOf(tag) : -1;
  if (!tag || at < 0) return entry.label;
  return (
    <>
      {entry.label.slice(0, at)}
      <bdi dir="ltr">{tag}</bdi>
      {entry.label.slice(at + tag.length)}
    </>
  );
}

function HistoryRow({ entry }: { entry: LoyaltyHistoryEntry }) {
  const earned = entry.kind === 'earned';
  return (
    <li className="flex min-h-[64px] items-center justify-between gap-4 border-b border-border py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] lg:text-base">{labelOf(entry)}</span>
        <span className="text-[13px] text-muted-foreground">
          {longDate(entry.date)}
          {entry.afterDelivery ? ' · بعد الاستلام' : ''}
        </span>
      </span>
      <b className={cn('shrink-0 text-base tabular-nums', earned ? 'text-success' : 'text-foreground')} aria-label={`${earned ? 'أُضيفت' : 'خُصمت'} ${formatPoints(entry.points)} نقطة`}>
        <bdi dir="ltr">
          {earned ? '+' : '−'}
          {formatPoints(entry.points)}
        </bdi>
      </b>
    </li>
  );
}

/**
 * نقاطي (loyalty add-on «Loyalty»): the balance on navy - its value at
 * checkout and what expires soon - a row to قسائمي, how points are earned,
 * and the history (earned in green, redeemed in ink).
 */
export function LoyaltyPage() {
  const shop = useShop();
  useTitle('نقاطي');
  const { info, status, reload } = shop.loyalty;

  // A fresh balance every visit (an order may have been delivered since).
  useEffect(() => {
    if (shop.auth.token) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop.auth.token]);

  const earn = info?.earn;
  const perOrder = earn?.points && earn.perAmount ? earn : null;

  return (
    <AccountLayout section="loyalty" crumbs={[{ label: 'نقاطي' }]}>
      <PageHead title="نقاطي" sub="اجمع النقاط مع كل طلب واستخدمها خصماً على طلبك التالي." />
      {!info ? (
        status === 'off' || status === 'error' ? (
          <Unavailable failed={status === 'error'} onRetry={() => void reload()} />
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <Skeleton className="h-52" />
            <Skeleton className="h-72" />
          </div>
        )
      ) : (
        <div className="grid items-start gap-8 xl:grid-cols-2 xl:gap-10">
          <div className="flex flex-col gap-6">
            <section aria-label="رصيدك" className="flex animate-result-in flex-col gap-1.5 bg-dark-ocean p-6 text-white lg:p-8">
              <span className="text-sm text-nebula">رصيدك</span>
              <b className="flex items-baseline gap-2 leading-none">
                <bdi dir="ltr" className="font-display text-[44px] tabular-nums lg:text-[56px]">
                  {formatPoints(info.points)}
                </bdi>
                <span className="text-lg">نقطة</span>
              </b>
              {info.value > 0 ? (
                <span className="mt-1 text-[15px]">
                  تساوي <bdi dir="ltr" className="tabular-nums">{formatPrice(info.value)}</bdi> د.ل عند الطلب
                </span>
              ) : null}
              {info.expiring?.points ? (
                <span className="mt-2 text-[13px] text-nebula">
                  <bdi dir="ltr" className="tabular-nums">
                    {formatPoints(info.expiring.points)}
                  </bdi>{' '}
                  نقطة تنتهي في {longDate(info.expiring.date)}
                </span>
              ) : null}
            </section>

            <Link
              to={{ name: 'account', section: 'coupons' }}
              className="flex min-h-14 items-center justify-between gap-3 border border-border px-4 py-3 transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2.5">
                <CouponIcon className="text-brand-text" />
                <b className="text-base">قسائمي</b>
              </span>
              <span className="flex items-center gap-2 text-[15px] text-muted-foreground">
                {info.couponsAvailable > 0 ? `${couponsText(info.couponsAvailable)} متاحة` : 'لا قسائم متاحة'}
                <ChevronLeft className="size-[18px] text-foreground" aria-hidden />
              </span>
            </Link>

            {perOrder || earn?.review ? (
              <section className="flex flex-col gap-4">
                <h2 className="text-lg font-bold">كيف تكسب النقاط</h2>
                {perOrder ? (
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-image-bg text-brand-text">
                      <Package className="size-5" strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <b className="text-[15px]">مع كل طلب</b>
                      <span className="text-[13px] text-muted-foreground">
                        <bdi dir="ltr">{formatPoints(perOrder.points!)}</bdi> نقطة لكل <bdi dir="ltr">{formatPrice(perOrder.perAmount!)}</bdi> د.ل، تُضاف بعد الاستلام
                      </span>
                    </span>
                  </div>
                ) : null}
                {earn?.review ? (
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-image-bg text-brand-text">
                      <Star className="size-5" strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <b className="text-[15px]">بتقييم مرتبتك</b>
                      <span className="text-[13px] text-muted-foreground">
                        <bdi dir="ltr">{formatPoints(earn.review)}</bdi> نقطة عند نشر تقييمك
                      </span>
                    </span>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <section className="flex flex-col">
            <h2 className="pb-1 text-lg font-bold">السجل</h2>
            {info.history.length ? (
              <ul className="flex flex-col">
                {[...info.history]
                  .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                  .map((h) => (
                    <HistoryRow key={h.id} entry={h} />
                  ))}
              </ul>
            ) : (
              <p className="py-4 text-[15px] text-muted-foreground">لا حركات بعد. تُضاف نقاط طلبك بعد استلامه.</p>
            )}
          </section>
        </div>
      )}
    </AccountLayout>
  );
}

/** «50 د.ل» or «10٪», with «خصم» under it. */
function Stub({ coupon }: { coupon: Coupon }) {
  return (
    <div className="flex w-[92px] shrink-0 flex-col items-center justify-center gap-0.5 border-e-2 border-dashed border-white bg-sun-glare px-1 py-4 text-dark-ocean sm:w-[112px] dark:border-background">
      <b className="flex items-start gap-0.5 leading-none">
        {coupon.value !== null ? (
          <>
            <bdi dir="ltr" className="text-2xl tabular-nums">
              {formatPrice(coupon.value)}
            </bdi>
            <span className="mt-0.5 text-[11px]">د.ل</span>
          </>
        ) : (
          <bdi dir="ltr" className="text-2xl tabular-nums">
            {formatPrice(coupon.percent ?? 0)}٪
          </bdi>
        )}
      </b>
      <span className="text-[11px] font-bold">خصم</span>
    </div>
  );
}

function CouponCard({ coupon, used = false }: { coupon: Coupon; used?: boolean }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(coupon.code);
      toast.success('نُسخ الرمز', { duration: 2000 });
    } catch {
      toast.error('تعذّر النسخ. انسخ الرمز يدوياً.');
    }
  }
  return (
    <li className={cn('flex min-w-0 border border-border', used && 'opacity-[.45]')}>
      <Stub coupon={coupon} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 py-3">
        <b className="text-[15px] leading-snug">{coupon.title}</b>
        {coupon.expires ? <span className="text-[13px] text-muted-foreground">ينتهي {longDate(coupon.expires)}</span> : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <bdi dir="ltr" className="font-mono text-sm font-bold tracking-wider">
            {coupon.code}
          </bdi>
          {used ? (
            <span className="text-[13px] text-muted-foreground">مستخدمة</span>
          ) : (
            <Button type="button" variant="outline" className="h-11 gap-1.5 rounded-full border-[1.5px] border-foreground px-4 text-sm font-bold" onClick={() => void copy()} aria-label={`انسخ الرمز ${coupon.code}`}>
              <Copy className="size-4" aria-hidden />
              انسخ الرمز
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * قسائمي (loyalty add-on «Coupons»): a code field with «تطبيق» (checked by
 * the server against the cart, the coupon then kept for checkout), the
 * available coupons on a yellow stub with «انسخ الرمز», the used ones faded.
 */
export function CouponsPage() {
  const shop = useShop();
  useTitle('قسائمي');
  const token = shop.auth.token;
  const [data, setData] = useState<CouponsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const applied = shop.loyalty.coupon;

  const load = useCallback(async () => {
    if (!token) return;
    setFailed(false);
    try {
      setData(await api.getCoupons(token));
    } catch {
      setFailed(true);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);

  const off = data ? !data.enabled : failed;

  return (
    <AccountLayout section="coupons" crumbs={[{ label: 'نقاطي', to: { name: 'account', section: 'loyalty' } }, { label: 'قسائمي' }]}>
      <PageHead title="قسائمي" sub="أدخل رمزاً أو انسخ إحدى قسائمك لتستخدمها في طلبك." />
      {off ? (
        <Unavailable failed={failed} onRetry={() => void load()} />
      ) : !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[52px] max-w-xl" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="flex max-w-xl flex-col gap-3">
            {token ? (
              <CouponCodeForm
                token={token}
                subtotal={shop.cart.total}
                onApplied={(c) => {
                  shop.loyalty.setCoupon(c);
                  toast.success('طُبّقت القسيمة', { duration: 2000 });
                }}
              />
            ) : null}
            {applied ? (
              <div role="status" className="flex animate-fade-up flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-success/10 px-4 py-3 text-sm">
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                <span className="min-w-0 flex-1">
                  القسيمة <bdi dir="ltr" className="font-mono font-bold">{applied.code}</bdi> جاهزة لطلبك
                  {applied.discount > 0 ? (
                    <>
                      : خصم <bdi dir="ltr" className="tabular-nums">{formatPrice(applied.discount)}</bdi> د.ل
                    </>
                  ) : null}
                  .
                </span>
                {shop.cart.lines.length ? (
                  <Link to={{ name: 'checkout' }} className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
                    إتمام الطلب
                  </Link>
                ) : null}
                <button type="button" className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4" onClick={() => shop.loyalty.setCoupon(null)}>
                  إزالة
                </button>
              </div>
            ) : null}
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">المتاحة</h2>
            {data.available.length ? (
              <ul className="grid gap-4 xl:grid-cols-2">
                {data.available.map((c) => (
                  <CouponCard key={c.code} coupon={c} />
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted-foreground">لا قسائم متاحة الآن. نُرسل القسائم الجديدة إلى حسابك.</p>
            )}
          </section>

          {data.used.length ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">المستخدمة</h2>
              <ul className="grid gap-4 xl:grid-cols-2">
                {data.used.map((c) => (
                  <CouponCard key={c.code} coupon={c} used />
                ))}
              </ul>
            </section>
          ) : null}

          {/* The owner's rule: points or one coupon per order (the app's prototype said they combine). */}
          <p className="text-[13px] leading-relaxed text-muted-foreground">تُطبَّق قسيمة واحدة لكل طلب، ولا تُجمع مع خصم النقاط.</p>
        </div>
      )}
    </AccountLayout>
  );
}
