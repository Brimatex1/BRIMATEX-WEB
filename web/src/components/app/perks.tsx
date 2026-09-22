import { BedDouble, Check, Cloud, Heart, ShoppingBag, Smile, Star, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { RewardIcon, Voucher } from '@/types';

/*
 * Loyalty pieces from the iOS app (brimatex-ios/src/components/Perks.tsx):
 * the progress ring and the voucher ticket.
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
 * Beads around a white circle - the completed share in Dark Ocean, the rest
 * light - with the reward's icon inside and a check once it is complete.
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
        className="absolute grid place-items-center rounded-full bg-white shadow-app-raised"
        style={{ inset: 12 }}
      >
        <Icon className="text-app-ocean" style={{ width: size * 0.3, height: size * 0.3 }} />
      </div>
      {Array.from({ length: beads }).map((_, i) => {
        const a = (-90 + (360 / beads) * i) * (Math.PI / 180);
        return (
          <span
            key={i}
            className={cn('absolute size-1.5 rounded-full', i < done ? 'bg-app-ocean' : 'bg-app-tint')}
            style={{ left: size / 2 + r * Math.cos(a) - 3, top: size / 2 + r * Math.sin(a) - 3 }}
          />
        );
      })}
      {complete && (
        <span className="absolute top-1.5 end-1.5 grid size-7 place-items-center rounded-full bg-app-success">
          <Check className="size-4 text-white" />
        </span>
      )}
    </div>
  );
}

/**
 * The voucher ticket: a frame in the brand colour (pink when about to expire,
 * grey once used or expired), "valid until" on top, a dashed tear line with a
 * notch at each end, then the icon, title, discount and code.
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
  const tone = urgent ? 'border-app-danger text-app-danger' : active ? 'border-app-ocean text-app-ocean' : 'border-app-muted text-app-muted';
  const until = new Date(voucher.validUntil).toLocaleDateString('ar-LY', { day: 'numeric', month: 'numeric', year: '2-digit' });
  const Icon = REWARD_ICONS[voucher.icon] ?? ShoppingBag;

  return (
    <div className={cn('relative mb-4 rounded-[20px] border-2 bg-white', tone, !active && 'opacity-60')}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className={cn('rounded-full px-3 py-1 text-xs font-semibold text-white', urgent ? 'bg-app-danger' : 'bg-app-ocean')}>
          صالحة حتى {until}
        </span>
        {urgent && <span className="text-xs text-app-danger">بقي {left <= 0 ? 'اليوم' : `${left} أيام`}</span>}
        <span className="ms-auto text-sm font-bold">قسيمة</span>
      </div>

      {/* The tear line, with a notch cut into each side */}
      <div className={cn('mx-4 mt-3 border-t-2 border-dashed', tone)} />
      <span className={cn('absolute -start-[11px] top-[46px] size-5 rounded-full border-2 border-s-transparent bg-white', tone)} />
      <span className={cn('absolute -end-[11px] top-[46px] size-5 rounded-full border-2 border-e-transparent bg-white', tone)} />

      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[17px] font-bold text-app-text">
            <Icon className="size-5 text-app-ocean" aria-hidden="true" />
            {voucher.title}
          </p>
          <p className="mt-1 text-sm text-app-text">{voucher.body}</p>
          <p className="mt-1 font-mono text-xs tracking-wider text-app-muted" dir="ltr">
            {voucher.code}
          </p>
        </div>
        {active && onApply ? (
          <button
            type="button"
            onClick={() => onApply(voucher)}
            aria-pressed={applied}
            className={cn(
              'shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold',
              applied ? 'bg-app-success text-white' : 'bg-app-ocean text-white'
            )}
          >
            {applied ? 'مُطبَّقة' : 'استخدم'}
          </button>
        ) : (
          <span
            className={cn(
              'shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold',
              active ? 'bg-app-ocean text-white' : 'bg-app-input text-app-muted'
            )}
          >
            {active ? 'مُحصَّلة' : voucher.state === 'used' ? 'مستخدمة' : 'منتهية'}
          </span>
        )}
      </div>
    </div>
  );
}
