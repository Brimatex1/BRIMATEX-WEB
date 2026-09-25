import { BedDouble, CalendarClock, Check, Cloud, Heart, ShoppingBag, Smile, Star, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { RewardIcon, Voucher } from '@/types';

/*
 * Loyalty pieces shared by the vouchers and points screens (and checkout):
 * the reward icons, the discount label, the progress ring and the voucher
 * card. They mirror the iOS app's (brimatex-ios/src/components/Perks.tsx) in
 * substance, drawn with the site's shadcn/ui primitives.
 */

export const REWARD_ICONS: Record<RewardIcon, LucideIcon> = {
  bag: ShoppingBag,
  heart: Heart,
  star: Star,
  cloud: Cloud,
  bed: BedDouble,
  happy: Smile,
};

export function discountLabel(v: Pick<Voucher, 'discount' | 'unit'>): string {
  return v.unit === '%' ? `خصم ${v.discount}%` : `خصم ${v.discount} د.ل`;
}

export function daysLeft(v: Voucher): number {
  return Math.ceil((new Date(v.validUntil).getTime() - Date.now()) / 86_400_000);
}

/**
 * Beads around a card-coloured circle - the completed share in the brand
 * navy, the rest faint - with the reward's icon inside and a check once it is
 * complete.
 */
export function ProgressRing({
  ratio,
  icon,
  complete,
  size = 120,
}: {
  ratio: number;
  icon: RewardIcon;
  complete?: boolean;
  size?: number;
}) {
  const beads = 36;
  const done = Math.round(Math.max(0, Math.min(1, ratio)) * beads);
  const r = size / 2 - 5;
  const Icon = REWARD_ICONS[icon];
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
      <div
        className="absolute grid place-items-center rounded-full border bg-card shadow-sm"
        style={{ inset: 12 }}
      >
        <Icon className="text-primary" style={{ width: size * 0.3, height: size * 0.3 }} />
      </div>
      {Array.from({ length: beads }).map((_, i) => {
        const a = (-90 + (360 / beads) * i) * (Math.PI / 180);
        return (
          <span
            key={i}
            className={cn('absolute size-1.5 rounded-full', i < done ? 'bg-primary' : 'bg-primary/20')}
            // Geometry, not layout: the beads sit on a circle, so physical offsets are intended
            style={{ left: size / 2 + r * Math.cos(a) - 3, top: size / 2 + r * Math.sin(a) - 3 }}
          />
        );
      })}
      {complete && (
        <span className="absolute top-1.5 end-1.5 grid size-7 place-items-center rounded-full bg-success">
          <Check className="size-4 text-success-foreground" />
        </span>
      )}
    </div>
  );
}

/**
 * The voucher as a card: the reward's icon, the discount in large type, the
 * title and terms, then - under a dashed tear line - the code, the validity
 * (in red when about to expire) and the voucher's state or, at checkout, the
 * button that applies it. Used and expired vouchers are dimmed.
 */
export function VoucherCard({
  voucher,
  onApply,
  applied,
}: {
  voucher: Voucher;
  /** Checkout: pick this voucher for the order. */
  onApply?: (v: Voucher) => void;
  applied?: boolean;
}) {
  const left = daysLeft(voucher);
  const active = voucher.state === 'active';
  const urgent = active && left <= 3;
  const until = new Date(voucher.validUntil).toLocaleDateString('ar-LY', { day: 'numeric', month: 'numeric', year: '2-digit' });
  const Icon = REWARD_ICONS[voucher.icon] ?? ShoppingBag;
  const applicable = active && onApply;

  return (
    <Card className={cn('overflow-hidden', urgent && 'border-destructive/50', !active && 'opacity-60')}>
      <div className="flex items-start gap-4 p-5">
        <span
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-lg',
            active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">قسيمة</p>
              <p className="text-2xl font-bold tracking-tight text-primary">{discountLabel(voucher)}</p>
            </div>
            {!applicable && (
              <Badge variant={active ? 'success' : 'secondary'} className="shrink-0">
                {active ? 'مُحصَّلة' : voucher.state === 'used' ? 'مستخدمة' : 'منتهية'}
              </Badge>
            )}
          </div>
          <p className="mt-2 font-semibold">{voucher.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{voucher.body}</p>
        </div>
      </div>

      {/* The tear line: the code and validity below it, like a ticket stub */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-dashed bg-muted/40 px-5 py-3">
        <code className="rounded-md border bg-background px-2.5 py-1 font-mono text-xs tracking-wider" dir="ltr">
          {voucher.code}
        </code>
        <span className={cn('flex items-center gap-1.5 text-xs', urgent ? 'text-destructive' : 'text-muted-foreground')}>
          <CalendarClock className="size-3.5" aria-hidden="true" />
          صالحة حتى {until}
          {urgent && <span className="font-medium">· بقي {left <= 0 ? 'اليوم' : `${left} أيام`}</span>}
        </span>
        {applicable && (
          <Button
            type="button"
            size="sm"
            onClick={() => onApply(voucher)}
            aria-pressed={applied}
            className={cn('ms-auto', applied && 'bg-success text-success-foreground hover:bg-success/90')}
          >
            {applied && <Check aria-hidden="true" />}
            {applied ? 'مُطبَّقة' : 'استخدم'}
          </Button>
        )}
      </div>
    </Card>
  );
}
