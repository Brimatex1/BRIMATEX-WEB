/**
 * The loyalty add-on (points and coupons): the customer's balance shared by
 * the account sidebar, «نقاطي», checkout and the confirmation page, the coupon
 * remembered between «قسائمي» and checkout, and the small parts they share.
 * Every number comes from the server (Odoo's program settings) - none is
 * written here. Disabled, or a failed call: `info` stays null and every
 * loyalty element hides (the guest teaser in the login drawer excepted).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn, formatPrice } from '@/lib/utils';
import type { CouponCheck, LoyaltyInfo } from '@/types';

const COUPON_KEY = 'brimatex:coupon';

/** A coupon the server accepted, with the subtotal it was checked against. */
export interface AppliedCoupon extends CouponCheck {
  subtotal: number;
}

export interface LoyaltyApi {
  /** The balance and history - null while loading, signed out, disabled or unreachable. */
  info: LoyaltyInfo | null;
  status: 'idle' | 'loading' | 'ready' | 'off' | 'error';
  reload: () => Promise<void>;
  /** The coupon chosen for the next order (kept for this tab). */
  coupon: AppliedCoupon | null;
  setCoupon: (coupon: AppliedCoupon | null) => void;
}

function readCoupon(): AppliedCoupon | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(COUPON_KEY) || 'null') as AppliedCoupon | null;
    return c && typeof c.code === 'string' && typeof c.discount === 'number' ? c : null;
  } catch {
    return null;
  }
}

/** Used once, by ShopProvider: one fetch of the balance for the whole shop. */
export function useLoyaltyStore(token: string | null, userId: string | number | null | undefined, checking: boolean): LoyaltyApi {
  const [info, setInfo] = useState<LoyaltyInfo | null>(null);
  const [status, setStatus] = useState<LoyaltyApi['status']>('idle');
  const [coupon, setCouponState] = useState<AppliedCoupon | null>(readCoupon);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latest.current;
    if (!token || !userId) {
      setInfo(null);
      setStatus('idle');
      return;
    }
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    try {
      const data = await api.getLoyalty(token);
      if (call !== latest.current) return;
      setInfo(data.enabled ? data : null);
      setStatus(data.enabled ? 'ready' : 'off');
    } catch {
      if (call !== latest.current) return;
      setInfo(null);
      setStatus('error');
    }
  }, [token, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setCoupon = useCallback((next: AppliedCoupon | null) => {
    setCouponState(next);
    try {
      if (next) sessionStorage.setItem(COUPON_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(COUPON_KEY);
    } catch {
      /* Kept in memory only */
    }
  }, []);

  // Signed out: the coupon was this customer's.
  useEffect(() => {
    if (!checking && !userId && coupon) setCoupon(null);
  }, [checking, userId, coupon, setCoupon]);

  return useMemo(() => ({ info, status, reload, coupon, setCoupon }), [info, status, reload, coupon, setCoupon]);
}

/** «1,240» - digits as the rest of the site writes them. */
export function formatPoints(n: number): string {
  return formatPrice(Math.max(0, Math.round(n)));
}

/** «لا قسائم», «قسيمة واحدة», «قسيمتان», «3 قسائم», «12 قسيمة». */
export function couponsText(n: number): string {
  if (n <= 0) return 'لا قسائم';
  if (n === 1) return 'قسيمة واحدة';
  if (n === 2) return 'قسيمتان';
  if (n >= 3 && n <= 10) return `${n} قسائم`;
  return `${n} قسيمة`;
}

/** Points an order of `total` earns once delivered (API.md), or null when the program does not say. */
export function pointsFor(total: number, info: LoyaltyInfo | null): number | null {
  const earn = info?.earn;
  if (!earn?.points || !earn.perAmount || total <= 0) return null;
  const points = Math.floor(total / earn.perAmount) * earn.points;
  return points > 0 ? points : null;
}

/** «30 نوفمبر 2026». */
export function longDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ar-LY', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** A circle with a star - the app's points mark. */
export function PointsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={cn('size-5 shrink-0', className)} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" strokeWidth={1.4} />
    </svg>
  );
}

/** A ticket with a perforation - the app's coupon mark. */
export function CouponIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={cn('size-5 shrink-0', className)} aria-hidden>
      <path d="M3.5 7.5h17v3a2 2 0 000 3v3h-17v-3a2 2 0 000-3z" />
      <path d="M14.5 7.5v9" strokeDasharray="1.6 1.8" />
    </svg>
  );
}

/** «−24.8 د.ل», the minus before the digits. */
export function Minus({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-start gap-0.5 font-bold tabular-nums leading-none', className)}>
      <bdi dir="ltr" className="text-base">
        −{formatPrice(amount)}
      </bdi>
      <span className="mt-0.5 text-[11px] font-semibold">د.ل</span>
    </span>
  );
}

/**
 * The code field and «تطبيق»: the server checks the code against `subtotal`;
 * a refusal shows under the field, an acceptance goes to `onApplied`.
 */
export function CouponCodeForm({ token, subtotal, onApplied, id = 'coupon-code', compact = false, autoFocus = false }: { token: string; subtotal: number; onApplied: (c: AppliedCoupon) => void; id?: string; compact?: boolean; autoFocus?: boolean }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) return setError('أدخل رمز القسيمة.');
    setBusy(true);
    setError(null);
    try {
      const { coupon } = await api.checkCoupon(token, clean, subtotal);
      setCode('');
      onApplied({ ...coupon, subtotal });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'الرمز غير صحيح أو منتهي');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-2">
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          رمز القسيمة
        </label>
        <input
          id={id}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder="أدخل رمز القسيمة"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            'min-w-0 flex-1 rounded-lg border bg-background px-4 text-base uppercase outline-none placeholder:normal-case placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-ring',
            compact ? 'h-11' : 'h-[52px]',
            error ? 'border-destructive' : 'border-input'
          )}
        />
        <Button type="submit" loading={busy} className={cn('shrink-0 rounded-full px-6 font-bold', compact ? 'h-11' : 'h-[52px] text-base')}>
          تطبيق
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex animate-fade-up items-start gap-1.5 text-[13px] text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </form>
  );
}
