import { useEffect, useState } from 'react';
import {
  BedDouble,
  Check,
  CircleX,
  ClipboardCheck,
  Copy,
  Factory,
  MessageCircle,
  PackageCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { AFTER_DELIVERY_TIP, trackingOf, type Status, type TrackStep } from '@/lib/orderStatus';
import { openSupport } from '@/lib/support';
import { cn } from '@/lib/utils';
import type { OrderSummary } from '@/types';

const STEP_ICONS: Record<TrackStep['key'], LucideIcon> = {
  review: ClipboardCheck,
  confirmed: PackageCheck,
  shipping: Truck,
  done: BedDouble,
};

const STATUS_ICONS: Record<Exclude<Status, 'cancelled'>, LucideIcon> = {
  review: ClipboardCheck,
  preparing: PackageCheck,
  making: Factory,
  shipping: Truck,
  done: BedDouble,
};

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`نُسخ رقم ${label}`);
  } catch {
    toast.error('تعذّر النسخ');
  }
}

/**
 * Where an order stands: the status and what comes next, four steps to tap,
 * and under them the chosen step's time and documents. The wording lives in
 * lib/orderStatus.ts (STATUS) - one place for the badge, the step and the
 * headline.
 */
export function OrderTracker({ order }: { order: OrderSummary }) {
  const t = trackingOf(order);
  const [selected, setSelected] = useState(t.current);
  // When the order moves on (the page refreshes itself), follow it.
  useEffect(() => setSelected(t.current), [t.current]);

  if (t.status === 'cancelled') {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center">
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
          <CircleX className="size-6" aria-hidden="true" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="font-bold text-destructive">{t.headline}</p>
          {t.sub && <p className="text-sm text-muted-foreground">{t.sub}</p>}
        </div>
        <Button
          size="sm"
          className="gap-2 self-start sm:self-auto"
          onClick={() => openSupport({ topic: 'order', orderName: order.orderName })}
        >
          <MessageCircle /> تواصل معنا
        </Button>
      </div>
    );
  }

  const step = t.steps[selected];
  const HeroIcon = STATUS_ICONS[t.status];
  const making = t.status === 'making' || order.leadDays != null;
  const fill = (t.current / (t.steps.length - 1)) * 100;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border bg-card">
        {/* ── Where it is now ── */}
        <div className="flex items-center gap-4 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent p-4">
          <div className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            {/* A soft halo while the order is still moving; still once it has arrived. */}
            {t.status !== 'done' && (
              <span
                className="absolute -inset-1.5 animate-pulse rounded-[1.25rem] bg-primary/20 motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            <HeroIcon className="relative size-7" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-tight">{t.headline}</p>
            {t.sub && <p className="mt-0.5 text-sm text-muted-foreground">{t.sub}</p>}
          </div>
        </div>

        {/* ── The four steps: tap one to see when it happened ── */}
        <div className="px-3 pb-2 pt-5 sm:px-5">
          <div className="relative grid grid-cols-4">
            {/* The line runs from the first step's centre to the last's; its fill grows from the start (right, in Arabic). */}
            <div className="absolute inset-x-[12.5%] top-5 h-1 -translate-y-1/2 rounded-full bg-muted" aria-hidden="true">
              <div
                className="absolute inset-y-0 start-0 rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${fill}%` }}
              />
            </div>
            {t.steps.map((s, i) => {
              const Icon = s.key === 'confirmed' && making ? Factory : STEP_ICONS[s.key];
              const active = i === selected;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSelected(i)}
                  aria-pressed={active}
                  aria-label={`${s.label}${s.state === 'current' ? ' — الآن' : ''}`}
                  className="group relative flex flex-col items-center gap-2 rounded-lg pb-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'relative grid size-10 place-items-center rounded-full border-2 transition-all duration-300',
                      s.state === 'done' && 'border-primary bg-primary text-primary-foreground',
                      s.state === 'current' && 'border-primary bg-background text-primary ring-4 ring-primary/15',
                      s.state === 'upcoming' && 'border-border bg-background text-muted-foreground',
                      active ? 'scale-110 shadow-md' : 'group-hover:scale-105'
                    )}
                  >
                    {s.state === 'done' ? <Check className="size-5" aria-hidden="true" /> : <Icon className="size-5" aria-hidden="true" />}
                  </span>
                  <span
                    className={cn(
                      'text-center text-xs transition-colors',
                      active ? 'font-bold text-foreground' : s.state === 'upcoming' ? 'text-muted-foreground' : 'font-medium text-foreground/80'
                    )}
                  >
                    {s.label}
                  </span>
                  <span
                    className={cn('h-0.5 w-6 rounded-full transition-colors', active ? 'bg-primary' : 'bg-transparent')}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── The chosen step: its time and documents only - the headline already says what it means ── */}
        <div
          key={step.key}
          className="mx-3 mb-3 flex animate-fade-up flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-muted/50 px-4 py-3 sm:mx-5 sm:mb-5"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{selected === t.current ? 'آخر تحديث' : step.label}</span>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                step.state === 'upcoming' ? 'bg-background text-muted-foreground' : 'bg-primary/10 text-primary'
              )}
            >
              {step.when ?? (step.state === 'current' ? 'الآن' : step.state === 'done' ? 'تم' : 'قريباً')}
            </span>
          </div>
          {step.state !== 'upcoming' && step.docs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {step.docs.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => void copy(d.value, d.label)}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs transition-colors hover:bg-muted"
                  aria-label={`نسخ رقم ${d.label} ${d.value}`}
                >
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="tabular font-medium" dir="ltr">
                    {d.value}
                  </span>
                  <Copy className="size-3 text-muted-foreground" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {t.status === 'done' && <p className="px-1 text-xs text-muted-foreground">{AFTER_DELIVERY_TIP}</p>}
    </div>
  );
}
