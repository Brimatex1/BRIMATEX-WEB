/**
 * The storefront's small parts with no shadcn equivalent (design/docs/DESIGN.md
 * «Components»): logo, prices, stars, tier tag, status dot, quantity stepper,
 * empty state, page container. Colours come from the CSS variables only.
 */
import type { ReactNode } from 'react';
import { Check, Minus, Plus, Star, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatPrice } from '@/lib/utils';

import logoNavy from './assets/logo-navy.svg';
import logoWhite from './assets/logo-white.svg';
import { TIER_TITLE, type Tone, type TierKey } from './catalog';

/** Navy on light, white on dark (and on navy panels when `onDark`). */
export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn('inline-block', className)}>
      <img src={onDark ? logoWhite : logoNavy} alt="بريماتكس" className={cn('h-full w-auto', !onDark && 'dark:hidden')} />
      {!onDark && <img src={logoWhite} alt="" aria-hidden className="hidden h-full w-auto dark:block" />}
    </span>
  );
}

/** The page's width: 1280 px max, 40 px sides on desktop, 16 px on phones. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-content px-4 lg:px-10', className)}>{children}</div>;
}

/** A size, left to right inside Arabic: «180×200». */
export function SizeText({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

const PRICE_SIZES = {
  page: { amount: 'text-[28px] lg:text-[34px]', unit: 'text-sm' },
  card: { amount: 'text-xl lg:text-2xl', unit: 'text-[11px]' },
  row: { amount: 'text-base', unit: 'text-[11px]' },
} as const;

/** «2,515 د.ل» with the unit raised, digits lined up. */
export function Price({ amount, size = 'card', className }: { amount: number; size?: keyof typeof PRICE_SIZES; className?: string }) {
  const s = PRICE_SIZES[size];
  return (
    <span className={cn('inline-flex items-start gap-0.5 font-bold tabular-nums leading-none', className)}>
      <span className={s.amount}>{formatPrice(amount)}</span>
      <span className={cn(s.unit, 'mt-0.5 font-semibold')}>د.ل</span>
    </span>
  );
}

/** Only when there is a discount: the price in a Sun Glare box with a red underline, the old one struck below. */
export function DiscountPrice({ amount, was, size = 'card' }: { amount: number; was: number; size?: keyof typeof PRICE_SIZES }) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="bg-discount px-1.5 py-0.5 text-dark-ocean shadow-[0_3px_0_hsl(var(--discount-underline))]">
        <Price amount={amount} size={size} />
      </span>
      <span className="text-xs text-muted-foreground">
        السعر السابق <s className="tabular-nums">{formatPrice(was)} د.ل</s>
      </span>
    </span>
  );
}

/** Five 14 px stars (filled in the text colour) and «(12)». */
export function RatingStars({ average, count, size = 14, className }: { average: number; count: number; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-label={`التقييم ${average.toFixed(1)} من 5، ${count} تقييم`} role="img">
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} style={{ width: size, height: size }} strokeWidth={1.8} className={i + 0.5 <= average ? 'fill-foreground text-foreground' : 'text-foreground'} />
        ))}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">({count})</span>
    </span>
  );
}

/** Square, 22 px - the same colours in light and dark. */
export function TierTag({ tier, className }: { tier: TierKey; className?: string }) {
  return (
    <Badge variant={tier} className={className}>
      {TIER_TITLE[tier]}
    </Badge>
  );
}

const DOT: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  destructive: 'bg-destructive',
};

/** Status is always a dot and words, never colour alone. */
export function StatusDot({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px]', className)}>
      <span className={cn('size-2.5 shrink-0 rounded-full', DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

/** − 1 + in a capsule. */
export function QuantityStepper({ value, onChange, min = 1, max = 99, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="inline-flex h-10 items-center rounded-full border border-border" role="group" aria-label={`الكمية: ${label}`}>
      <button type="button" className="relative grid size-10 place-items-center rounded-full after:absolute after:-inset-y-1 disabled:opacity-40" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="زيادة الكمية">
        <Plus className="size-4" />
      </button>
      <span className="min-w-6 text-center text-[15px] font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className="relative grid size-10 place-items-center rounded-full after:absolute after:-inset-y-1 disabled:opacity-40" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="إنقاص الكمية">
        <Minus className="size-4" />
      </button>
    </div>
  );
}

/** A grey circle with an icon, a title, one sentence and one outline button. */
export function EmptyState({ icon, title, body, action, onAction, className }: { icon: ReactNode; title: string; body?: string; action?: string; onAction?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-16 text-center', className)}>
      <span className="grid size-[72px] place-items-center rounded-full bg-image-bg text-muted-foreground [&_svg]:size-7">{icon}</span>
      <h2 className="text-lg font-bold">{title}</h2>
      {body ? <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground">{body}</p> : null}
      {action ? (
        <Button variant="outline" size="store" className="mt-2" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </div>
  );
}

/** Why «إتمام الطلب» is off: the maintenance message (the admin panel's «وضع الصيانة»). */
export function MaintenanceNote({ message, className }: { message: string; className?: string }) {
  return (
    <p role="status" className={cn('flex items-start gap-2 text-[13px] font-semibold text-[#7A5300] dark:text-[#F3D58A]', className)}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden />
      <span>{message}</span>
    </p>
  );
}

/** A grey block in place of what is loading, a slow shimmer across it (static under reduced motion). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-image-bg before:absolute before:inset-0 before:translate-x-full before:animate-shimmer before:bg-gradient-to-l before:from-transparent before:via-white/50 before:to-transparent dark:before:via-white/[0.06]',
        className
      )}
      aria-hidden
    />
  );
}

/**
 * Done (MOTION.md «Order placed»): the circle pops in, the check draws itself,
 * then whatever follows fades up - give it `AFTER_MARK`.
 */
export function SuccessMark({ solid = false }: { solid?: boolean }) {
  return (
    <span className={cn('grid size-16 animate-pop-in place-items-center rounded-full', solid ? 'bg-success text-white' : 'bg-success/10 text-success')} aria-hidden>
      <Check className="draw-check size-8" strokeWidth={2.5} />
    </span>
  );
}

export const AFTER_MARK = 'animate-fade-up [animation-delay:350ms] [animation-fill-mode:both]';
