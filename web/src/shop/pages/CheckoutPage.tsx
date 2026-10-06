import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Banknote, Building2, Check, ChevronDown, ChevronLeft, CreditCard, Store, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { forgetCheckout, setPixelPerson, trackAddPaymentInfo, trackCheckoutOnce, trackPurchase, trackingContext } from '@/lib/pixel';
import { cn, formatPrice, toLatinDigits } from '@/lib/utils';
import type { LoyaltyChoice } from '@/types';

import { displayName, lineParts } from '../catalog';
import { useTitle } from '../hooks';
import { isLibyanMobile } from '../LoginDrawer';
import { CouponCodeForm, CouponIcon, formatPoints, Minus, PointsIcon } from '../loyalty';
import { photoOf } from '../ProductCard';
import { Link, useRouter } from '../router';
import { lineItem, useShop } from '../state';
import { Container, MaintenanceNote, Price, SizeText } from '../ui';
import { SummaryRow } from './CartPage';

type Payment = 'cash' | 'card' | 'transfer';
type Slot = 'morning' | 'evening';

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const PAYMENTS: { value: Payment; label: string; icon: typeof Banknote }[] = [
  { value: 'cash', label: 'نقداً', icon: Banknote },
  { value: 'card', label: 'بطاقة مصرفية', icon: CreditCard },
  { value: 'transfer', label: 'حوالة مصرفية', icon: Building2 },
];
export const PAYMENT_LABEL: Record<Payment, string> = { cash: 'نقداً', card: 'بطاقة مصرفية', transfer: 'حوالة مصرفية' };
export const SLOT_LABEL: Record<Slot, string> = { morning: 'صباحاً', evening: 'مساءً' };
const SHOWROOM_ADDRESS = 'استلام من الصالة · حي الأندلس';

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Delivery days to choose from: from the earliest the order can arrive - `from`
 * working days after today (1 in stock, 3 not: the catalogue's deliveryDays) -
 * Fridays skipped, as the app.
 */
function deliveryDays(from: number, count = 5): Date[] {
  const days: Date[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  let left = Math.max(1, from);
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 5) left--;
  }
  while (days.length < count) {
    if (d.getDay() !== 5) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function dayText(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** What the confirmation page shows, kept for this tab (it also re-reads the order from the account). */
export interface PlacedOrder {
  orderName: string;
  total: number;
  when: string;
  address: string;
  payment: string;
  phone: string;
  lines: { productId: number; quantity: number; price: number }[];
  /** Points or a coupon taken off (the loyalty add-on). */
  discount?: { label: string; amount: number } | null;
}
export const LAST_ORDER_KEY = 'brimatex:last-order';

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b border-border pb-8">
      <h2 className="flex items-center gap-3 text-xl font-bold lg:text-[22px]">
        <span className="grid size-8 place-items-center rounded-full bg-foreground text-sm text-background">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ id, label, value, onChange, error, placeholder, ltr, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; placeholder?: string; ltr?: boolean; autoComplete?: string }) {
  return (
    <label className="flex flex-col gap-1.5" htmlFor={id}>
      <b className="text-sm">{label}</b>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={ltr ? 'ltr' : undefined}
        inputMode={ltr ? 'tel' : undefined}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn('h-[52px] w-full rounded-lg border bg-background px-4 text-base outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-ring', ltr && 'text-start tabular-nums', error ? 'border-destructive' : 'border-input')}
      />
      {error ? (
        <span id={`${id}-error`} className="text-[13px] text-destructive">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function Option({ selected, onSelect, title, sub, icon, className }: { selected: boolean; onSelect: () => void; title: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn('flex items-center gap-3 rounded-lg border p-4 text-start transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected ? 'border-2 border-foreground p-[15px]' : 'border-border hover:border-foreground', className)}
    >
      <span className={cn('grid size-[22px] shrink-0 place-items-center rounded-full border-2', selected ? 'border-foreground' : 'border-input')} aria-hidden>
        {selected ? <span className="size-[9px] rounded-full bg-foreground" /> : null}
      </span>
      {icon ? <span className="text-brand-text [&_svg]:size-[22px]" aria-hidden>{icon}</span> : null}
      <span className="flex flex-col">
        <b className="text-[15px]">{title}</b>
        {sub ? <span className="text-[13px] text-muted-foreground">{sub}</span> : null}
      </span>
    </button>
  );
}

/**
 * إتمام الطلب (handoff WebCheckout; phones MCheckout): one page, three numbered
 * sections - the address (saved ones first), how it arrives (home on a day and
 * a period, or the showroom), how it is paid on delivery - and the summary
 * with «تأكيد الطلب». Signed-in only. Errors sit under their field, no shake.
 */
export function CheckoutPage() {
  const shop = useShop();
  const { go } = useRouter();
  useTitle('إتمام الطلب');
  const user = shop.auth.user;
  const pickup = shop.method === 'pickup';

  const saved = user?.addresses ?? [];
  const [savedId, setSavedId] = useState<string | null>(saved[0]?.id ?? null);
  const [city, setCity] = useState(shop.city ?? 'طرابلس');
  const [area, setArea] = useState('');
  const [street, setStreet] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saveAddress, setSaveAddress] = useState(true);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot>('morning');
  const [payment, setPayment] = useState<Payment>('cash');
  const [errors, setErrors] = useState<Partial<Record<'city' | 'area' | 'street' | 'phone', string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const requestId = useRef(newRequestId());
  // The loyalty add-on: points or one coupon, never both.
  const [usePoints, setUsePoints] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const [perkNote, setPerkNote] = useState<string | null>(null);

  // Signed out (a link, an expired session): the login drawer, then back here.
  useEffect(() => {
    if (!shop.auth.checking && !user) shop.requireLogin('checkout');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop.auth.checking, user]);
  useEffect(() => {
    if (user?.phone && !phone) setPhone(user.phone);
    if (user?.addresses?.length && !savedId) setSavedId(user.addresses[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const lines = shop.cart.lines.map((l) => ({ line: l, ...lineItem(shop.find, l.id) }));
  const total = shop.cart.total;
  // The slowest line decides the first day: a size not in stock arrives later (src/lib/availability.js).
  const slowest = lines.reduce<{ from: number; text: string | null }>(
    (acc, l) => {
      const v = l.variant;
      const from = v?.deliveryDays?.[0] ?? 1;
      return from > acc.from ? { from, text: v?.deliveryText ?? null } : acc.text === null && v?.deliveryText ? { from: acc.from, text: v.deliveryText } : acc;
    },
    { from: 1, text: null }
  );
  const days = useMemo(() => deliveryDays(slowest.from), [slowest.from]);
  useEffect(() => {
    if (!date || !days.some((d) => isoDay(d) === date)) setDate(isoDay(days[0]));
  }, [days, date]);

  // InitiateCheckout once per checkout (lib/pixel.ts trackCheckoutOnce), signed in and with
  // the customer's hashed phone, name and city in place first, so both the Pixel and the
  // server's copy carry them.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !shop.cart.lines.length || !user) return;
    started.current = true;
    const lines = shop.cart.lines;
    void setPixelPerson({ id: user.id, name: user.name, phone: user.phone, city: city || user.addresses?.[0]?.city })
      .catch(() => {})
      .then(() => trackCheckoutOnce(lines, total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop.cart.lines.length, user]);

  // Off, or the balance could not be read: no box, no lines, nothing sent.
  const perks = shop.loyalty.info;
  const coupon = perks ? shop.loyalty.coupon : null;
  const canUsePoints = Boolean(perks && perks.points > 0 && perks.value > 0);
  const pointsOff = perks && usePoints && canUsePoints ? Math.min(perks.value, total) : 0;
  const couponOff = coupon ? Math.min(coupon.discount, total) : 0;
  const payable = Math.max(0, Math.round((total - pointsOff - couponOff) * 100) / 100);
  const loyaltyChoice: LoyaltyChoice | undefined = pointsOff > 0 ? { usePoints: true } : coupon ? { coupon: coupon.code } : undefined;

  // A coupon kept from «قسائمي» was checked against another cart: check it again for this one.
  const token = shop.auth.token;
  useEffect(() => {
    if (!coupon || !token || !total || coupon.subtotal === total) return;
    let live = true;
    api
      .checkCoupon(token, coupon.code, total)
      .then(({ coupon: c }) => {
        if (live) shop.loyalty.setCoupon({ ...c, subtotal: total });
      })
      .catch((err) => {
        // Only a refusal removes it; offline, the server checks it again with the order.
        if (!live || !(err instanceof ApiError) || err.status < 400 || err.status >= 500) return;
        shop.loyalty.setCoupon(null);
        setPerkNote(`أزلنا القسيمة ${coupon.code}: ${err.message}`);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupon?.code, coupon?.subtotal, total, token]);

  function togglePoints() {
    const next = !usePoints;
    setUsePoints(next);
    if (next && coupon) {
      shop.loyalty.setCoupon(null);
      setPerkNote('أزلنا القسيمة، فالنقاط والقسيمة لا تُجمعان في طلب واحد.');
    } else setPerkNote(null);
  }

  const usingSaved = !pickup && savedId !== null && saved.some((a) => a.id === savedId);
  const chosenSaved = saved.find((a) => a.id === savedId);
  const when = pickup ? 'استلام من الصالة' : date ? `${dayText(date)} · ${SLOT_LABEL[slot]}` : '';

  function validate(): boolean {
    const next: typeof errors = {};
    if (!pickup && !usingSaved) {
      if (!city.trim()) next.city = 'اختر المدينة.';
      if (!area.trim()) next.area = 'أدخل المنطقة.';
      if (street.trim().length < 3) next.street = 'أدخل أقرب معلم ليصل السائق بسهولة.';
    }
    if (!isLibyanMobile(phone)) next.phone = 'رقم الهاتف يتكوّن من 10 أرقام ويبدأ بـ 09.';
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) document.getElementById(`co-${first}`)?.focus();
    return !first;
  }

  async function confirm() {
    // Maintenance: the server refuses too (503); this saves the round trip.
    if (submitting || shop.maintenance || !user || !lines.length || !validate()) return;
    setSubmitting(true);
    setFailure(null);
    const address = pickup ? SHOWROOM_ADDRESS : usingSaved ? chosenSaved!.address : `${area.trim()}، ${street.trim()}`;
    const orderCity = pickup ? 'طرابلس' : usingSaved ? chosenSaved!.city : city.trim();
    try {
      trackAddPaymentInfo(shop.cart.lines, total);
      const result = await api.createOrder(
        { name: user.name, phone, city: orderCity, address },
        shop.cart.lines,
        '',
        shop.auth.token,
        trackingContext(),
        null,
        requestId.current,
        { delivery: pickup ? { method: 'pickup' } : { method: 'home', date: date ?? undefined, slot }, paymentMethod: payment, ...(loyaltyChoice ? { loyalty: loyaltyChoice } : {}) }
      );
      if (!pickup && !usingSaved && saveAddress && shop.auth.token) {
        api
          .addAddress(shop.auth.token, address, orderCity)
          .then(({ address: a }) => shop.auth.patchUser({ addresses: [...(user.addresses ?? []), a] }))
          .catch(() => {});
      }
      // Advanced Matching: the Purchase carries who ordered (hashed).
      await setPixelPerson({ id: user.id, name: user.name, phone, city: orderCity });
      // The amount the customer pays - the server's total (points or coupon included), else this page's.
      trackPurchase({ ...result, total: result.total || payable }, shop.cart.lines);
      forgetCheckout();
      const placed: PlacedOrder = {
        orderName: result.orderName,
        total: result.total || payable,
        when,
        address: pickup ? 'صالة العرض · حي الأندلس' : `${orderCity} · ${address.split('،')[0]}`,
        payment: `${PAYMENT_LABEL[payment]} عند الاستلام`,
        phone,
        lines: shop.cart.lines.map((l) => ({ productId: l.id, quantity: l.qty, price: l.price })),
        discount: pointsOff > 0 ? { label: 'خصم النقاط', amount: pointsOff } : coupon && couponOff > 0 ? { label: `خصم القسيمة ${coupon.code}`, amount: couponOff } : null,
      };
      try {
        sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(placed));
      } catch {
        /* the page re-reads it from the account */
      }
      shop.cart.clear();
      if (coupon) shop.loyalty.setCoupon(null);
      if (loyaltyChoice) void shop.loyalty.reload();
      go({ name: 'confirmed', order: result.orderName }, { replace: true });
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'تعذّر إرسال الطلب. حاول مجدداً.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!lines.length) {
    return (
      <Container className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-lg font-bold">لا شيء في السلة لإتمامه.</p>
        <Button asChild variant="outline" size="store">
          <Link to={{ name: 'category', tier: null }}>تسوّق المراتب</Link>
        </Button>
      </Container>
    );
  }

  // A guest who closed the login drawer: say why the form is not here, never a dead «تأكيد الطلب».
  if (!user) {
    return (
      <Container className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-lg font-bold">{shop.auth.checking ? 'جارٍ التحميل…' : 'سجّل الدخول لإتمام الطلب'}</p>
        {shop.auth.checking ? null : (
          <>
            <p className="max-w-md text-[15px] text-muted-foreground">نرسل رمز الدخول على واتساب. تبقى السلة كما هي.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="store" onClick={() => shop.requireLogin('checkout')}>
                تسجيل الدخول
              </Button>
              <Button asChild variant="outline" size="store">
                <Link to={{ name: 'cart' }}>العودة إلى السلة</Link>
              </Button>
            </div>
          </>
        )}
      </Container>
    );
  }

  const summaryLines = (
    <div className="flex flex-col gap-3">
      {lines.map(({ line, product, variant }) => {
        const parts = lineParts(variant);
        return (
          <div key={line.id} className="flex items-center gap-3">
            {product ? <img src={photoOf(product, 56)} alt="" className="size-14 shrink-0 bg-image-bg object-cover" /> : null}
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="text-sm">{product ? displayName(product) : line.name}</b>
              <span className="text-xs text-muted-foreground">
                {parts.size ? (
                  <>
                    <SizeText>{parts.size}</SizeText> سم ·{' '}
                  </>
                ) : null}
                الكمية {line.qty}
              </span>
            </span>
            <Price amount={line.price * line.qty} size="row" className="text-sm" />
          </div>
        );
      })}
    </div>
  );

  const totals = (
    <div className="flex flex-col gap-2.5">
      <SummaryRow label="المنتجات" value={<Price amount={total} size="row" />} />
      <SummaryRow label="التوصيل" value={pickup ? 'بدون رسوم' : 'مجاني'} />
      <SummaryRow label="الموعد" value={when} />
      {pointsOff > 0 ? (
        <div className="animate-fade-up text-success">
          <SummaryRow label="خصم النقاط" value={<Minus amount={pointsOff} />} />
        </div>
      ) : null}
      {coupon && couponOff > 0 ? (
        <div className="animate-fade-up text-success">
          <SummaryRow
            label={
              <>
                خصم القسيمة{' '}
                <bdi dir="ltr" className="font-mono text-[13px]">
                  {coupon.code}
                </bdi>
              </>
            }
            value={<Minus amount={couponOff} />}
          />
        </div>
      ) : null}
      <SummaryRow strong label="الإجمالي" value={<Price key={payable} amount={payable} className="animate-price-in" />} />
    </div>
  );

  // «استخدم نقاطك» and «قسيمة خصم» (loyalty add-on CheckoutReview), above the lines.
  // Drawn twice (phones above the folded summary, desktop in it); `slot` keeps the ids apart.
  const perksBox = (slot: 'm' | 'd') =>
    perks ? (
      <div className="flex flex-col gap-2">
        <div className="overflow-hidden rounded-lg border border-border">
          {canUsePoints ? (
            <button
              type="button"
              role="switch"
              aria-checked={usePoints}
              onClick={togglePoints}
              className="flex min-h-16 w-full items-center gap-3 border-b border-border px-4 py-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <PointsIcon className="text-brand-text" />
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="text-[15px]">استخدم نقاطك</b>
                <span className="text-[13px] text-muted-foreground">
                  <bdi dir="ltr" className="tabular-nums">
                    {formatPoints(perks.points)}
                  </bdi>{' '}
                  نقطة = <bdi dir="ltr" className="tabular-nums">{formatPrice(perks.value)}</bdi> د.ل
                </span>
              </span>
              <span className={cn('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-base', usePoints ? 'bg-primary' : 'bg-input/40')} aria-hidden>
                <span className={cn('absolute top-0.5 size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.2)] transition-all duration-base ease-out', usePoints ? 'start-[22px]' : 'start-0.5')} />
              </span>
            </button>
          ) : null}
          {coupon ? (
            <div className="flex min-h-14 items-center gap-3 px-4 py-2">
              <CouponIcon className="text-brand-text" />
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="text-[15px]">قسيمة خصم</b>
                <span className="truncate text-[13px] text-muted-foreground">
                  <bdi dir="ltr" className="font-mono font-bold text-foreground">
                    {coupon.code}
                  </bdi>{' '}
                  · {coupon.title}
                </span>
              </span>
              <button type="button" className="min-h-11 shrink-0 px-1 text-sm font-bold underline underline-offset-4" onClick={() => shop.loyalty.setCoupon(null)} aria-label={`إزالة القسيمة ${coupon.code}`}>
                إزالة
              </button>
            </div>
          ) : (
            <>
              <button type="button" aria-expanded={couponOpen} onClick={() => setCouponOpen((o) => !o)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <CouponIcon className="text-brand-text" />
                <b className="flex-1 text-[15px]">قسيمة خصم</b>
                <span className="text-[15px] text-brand-text">أضف رمزاً</span>
                <ChevronLeft className={cn('size-[18px] transition-transform duration-base', couponOpen && '-rotate-90')} aria-hidden />
              </button>
              {couponOpen && token ? (
                <div className="flex animate-fade-up flex-col gap-1 px-4 pb-3">
                  <CouponCodeForm
                    token={token}
                    subtotal={total}
                    compact
                    autoFocus
                    id={`co-coupon-${slot}`}
                    onApplied={(c) => {
                      shop.loyalty.setCoupon(c);
                      setCouponOpen(false);
                      if (usePoints) {
                        setUsePoints(false);
                        setPerkNote('أوقفنا خصم النقاط، فالنقاط والقسيمة لا تُجمعان في طلب واحد.');
                      } else setPerkNote(null);
                    }}
                  />
                  <Link to={{ name: 'account', section: 'coupons' }} className="inline-flex min-h-11 items-center self-start text-sm font-bold underline underline-offset-4">
                    اختر من قسائمي
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </div>
        {perkNote ? (
          <p key={perkNote} role="status" className="animate-fade-up text-[13px] text-muted-foreground">
            {perkNote}
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <Container className="pb-28 pt-6 lg:pb-16 lg:pt-10">
      {/* Phones: the summary folds at the top (MCheckout). */}
      <button type="button" className="mb-6 flex w-full items-center justify-between border-b border-border pb-4 lg:hidden" onClick={() => setSummaryOpen((o) => !o)} aria-expanded={summaryOpen}>
        <span className="flex items-center gap-2 font-bold">
          ملخّص الطلب · {shop.cart.count === 1 ? 'منتج واحد' : `${shop.cart.count} منتجات`}
          <ChevronDown className={cn('size-4 transition-transform', summaryOpen && 'rotate-180')} aria-hidden />
        </span>
        <Price key={payable} amount={payable} size="row" className="animate-price-in" />
      </button>
      {perks ? <div className="mb-6 lg:hidden">{perksBox('m')}</div> : null}
      {summaryOpen ? <div className="mb-8 flex flex-col gap-4 lg:hidden">{summaryLines}{totals}</div> : null}

      <div className="grid gap-10 lg:grid-cols-[1fr_400px] lg:gap-14">
        <div className="flex flex-col gap-8">
          {!pickup ? (
            <Section n={1} title="إلى أين نوصل المراتب؟">
              {saved.length ? (
                <div role="radiogroup" aria-label="العناوين المحفوظة" className="flex flex-col gap-2">
                  {saved.map((a) => (
                    <Option key={a.id} selected={savedId === a.id} onSelect={() => setSavedId(a.id)} title={a.city} sub={a.address} />
                  ))}
                  <Option selected={savedId === null} onSelect={() => setSavedId(null)} title="عنوان جديد" />
                </div>
              ) : null}
              {!usingSaved ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="co-city" label="المدينة" value={city} onChange={setCity} error={errors.city} autoComplete="address-level2" />
                  <Field id="co-area" label="المنطقة" value={area} onChange={setArea} error={errors.area} placeholder="مثال: حي الأندلس" />
                  <div className="sm:col-span-2">
                    <Field id="co-street" label="الشارع وأقرب معلم" value={street} onChange={setStreet} error={errors.street} placeholder="مثال: قرب جامع…، الدور الثاني" autoComplete="street-address" />
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="co-phone" label="رقم الهاتف" value={phone} onChange={(v) => setPhone(toLatinDigits(v).replace(/\D/g, '').slice(0, 10))} error={errors.phone} placeholder="09X XXX XXXX" ltr autoComplete="tel" />
              </div>
              {!usingSaved ? (
                <label className="flex cursor-pointer items-center gap-3 text-[15px]">
                  <input type="checkbox" className="peer sr-only" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                  <span className={cn('grid size-5 place-items-center rounded-[4px] border peer-focus-visible:ring-2 peer-focus-visible:ring-ring', saveAddress ? 'border-foreground bg-foreground text-background' : 'border-input')} aria-hidden>
                    {saveAddress ? <Check className="size-3.5" strokeWidth={3} /> : null}
                  </span>
                  احفظ العنوان
                </label>
              ) : null}
            </Section>
          ) : null}

          <Section n={pickup ? 1 : 2} title="كيف تصلك المراتب؟">
            <div role="radiogroup" aria-label="طريقة الاستلام" className="grid gap-3 sm:grid-cols-2">
              <Option selected={!pickup} onSelect={() => shop.setMethod('home')} icon={<Truck />} title="توصيل إلى المنزل" sub={`${usingSaved ? chosenSaved!.city : city}${!usingSaved && area ? ` · ${area}` : ''} · مجاني`} />
              <Option selected={pickup} onSelect={() => shop.setMethod('pickup')} icon={<Store />} title="استلام من الصالة" sub="حي الأندلس · بدون رسوم" />
            </div>
            {pickup ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="co-phone" label="رقم الهاتف" value={phone} onChange={(v) => setPhone(toLatinDigits(v).replace(/\D/g, '').slice(0, 10))} error={errors.phone} placeholder="09X XXX XXXX" ltr autoComplete="tel" />
              </div>
            ) : (
              <>
                <b className="text-[15px]">يوم التوصيل</b>
                {slowest.text ? <span className="-mt-1 text-[13px] text-muted-foreground">{slowest.text}</span> : null}
                <div role="radiogroup" aria-label="يوم التوصيل" className="grid grid-cols-5 gap-2">
                  {days.map((d) => {
                    const iso = isoDay(d);
                    const on = iso === date;
                    return (
                      <button key={iso} type="button" role="radio" aria-checked={on} onClick={() => setDate(iso)} className={cn('flex flex-col items-center gap-0.5 rounded-lg border py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'border-2 border-foreground py-[11px]' : 'border-border hover:border-foreground')}>
                        <span className="text-xs text-muted-foreground">{WEEKDAYS[d.getDay()]}</span>
                        <b className="text-lg tabular-nums">{d.getDate()}</b>
                      </button>
                    );
                  })}
                </div>
                <b className="text-[15px]">الفترة</b>
                <div role="radiogroup" aria-label="الفترة" className="grid grid-cols-2 gap-3">
                  {(['morning', 'evening'] as const).map((s) => (
                    <Option key={s} selected={slot === s} onSelect={() => setSlot(s)} title={SLOT_LABEL[s]} />
                  ))}
                </div>
                <span className="text-[13px] text-muted-foreground">الأيام المعروضة حسب جدول التوصيل لمنطقتك. يتصل بك السائق قبل الوصول.</span>
              </>
            )}
          </Section>

          <Section n={pickup ? 2 : 3} title="طريقة الدفع">
            <span className="-mt-2 text-sm text-muted-foreground">الدفع عند الاستلام</span>
            <div role="radiogroup" aria-label="طريقة الدفع" className="grid gap-3 sm:grid-cols-3">
              {PAYMENTS.map(({ value, label, icon: Icon }) => (
                <Option key={value} selected={payment === value} onSelect={() => setPayment(value)} icon={<Icon />} title={label} />
              ))}
            </div>
          </Section>

          <span className="text-sm text-muted-foreground">يمكنك إلغاء الطلب من حسابك ما دام لم يخرج للتوصيل.</span>
        </div>

        <aside className="hidden h-fit flex-col gap-5 rounded-lg border border-border p-6 lg:sticky lg:top-8 lg:flex">
          <b className="text-lg">ملخّص الطلب</b>
          {perksBox('d')}
          {summaryLines}
          <div className="border-t border-border pt-4">{totals}</div>
          {failure ? <FailureLine text={failure} /> : null}
          {shop.maintenance ? <MaintenanceNote message={shop.maintenance} /> : null}
          <Button size="store" loading={submitting} disabled={Boolean(shop.maintenance)} onClick={() => void confirm()} aria-busy={submitting}>
            تأكيد الطلب
          </Button>
          <span className="text-center text-[13px] text-muted-foreground">
            بتأكيد الطلب توافق على{' '}
            <Link to={{ name: 'legal', page: 'terms' }} className="underline">
              الشروط والأحكام
            </Link>
            .
          </span>
        </aside>
      </div>

      {/* Phones: «تأكيد الطلب · الإجمالي» at hand. */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t border-border bg-background px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
        {failure ? <FailureLine text={failure} /> : null}
        {shop.maintenance ? <MaintenanceNote message={shop.maintenance} /> : null}
        <Button size="store" className="w-full" loading={submitting} disabled={Boolean(shop.maintenance)} onClick={() => void confirm()}>
          تأكيد الطلب · <Price amount={payable} size="row" className="text-primary-foreground" />
        </Button>
      </div>
    </Container>
  );
}

function FailureLine({ text }: { text: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {text}
    </p>
  );
}
