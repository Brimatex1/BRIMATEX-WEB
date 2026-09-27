import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Gift, HandCoins, ShieldCheck, Ticket, Truck, type LucideIcon } from 'lucide-react';

import { discountLabel } from '@/components/app/perks';
import { DEFAULT_RULES, bestActiveVoucher, formatPoints, openLoyalty, pointsToNextVoucher } from '@/lib/loyalty';
import { cn } from '@/lib/utils';
import type { Perks, SectionId, User } from '@/types';

interface Message {
  key: string;
  Icon: LucideIcon;
  text: string;
  /** A tap does this; a message without one is information only. */
  action?: () => void;
}

const ROTATE_MS = 5000;

/**
 * The strip above the header: the shop's promises and the loyalty programme,
 * one message at a time. The programme comes first and speaks to the
 * visitor - a guest is invited to earn points, a customer sees their voucher
 * or how far the next one is - and a tap explains the programme or opens it.
 * Pauses under the pointer or focus; no sliding for reduced motion.
 */
export function AnnouncementBar({
  user,
  perks,
  onNavigate,
}: {
  user: User | null;
  perks: Perks | null;
  onNavigate: (section: SectionId) => void;
}) {
  const messages = useMemo<Message[]>(() => {
    const rules = perks?.points.rules ?? DEFAULT_RULES;
    const voucher = bestActiveVoucher(perks?.vouchers);
    const balance = perks?.points.balance ?? 0;
    const gap = pointsToNextVoucher(balance, rules);
    const loyalty: Message = !user
      ? {
          key: 'join',
          Icon: Gift,
          text: `سجّل واكسب نقطة على كل دينار - كل ${formatPoints(rules.stepPoints)} نقطة بخصم ${rules.stepValue} د.ل`,
          action: openLoyalty,
        }
      : voucher
        ? {
            key: 'voucher',
            Icon: Ticket,
            text: `عندك ${discountLabel(voucher)} - استعمله في طلبك القادم`,
            action: () => onNavigate('vouchers'),
          }
        : {
            key: 'points',
            Icon: Gift,
            text:
              gap === 0
                ? `رصيدك ${formatPoints(balance)} نقطة - بدّلها بقسيمة ${rules.stepValue} د.ل`
                : `رصيدك ${formatPoints(balance)} نقطة · باقي ${formatPoints(gap)} على قسيمة ${rules.stepValue} د.ل`,
            action: () => onNavigate('points'),
          };
    return [
      loyalty,
      { key: 'cod', Icon: HandCoins, text: 'الدفع عند الاستلام · توصيل مجاني لباب بيتك' },
      { key: 'warranty', Icon: ShieldCheck, text: 'ضمان حتى 10 سنوات لبعض المنتجات' },
      { key: 'made', Icon: Truck, text: 'من مصنعنا في ليبيا إلى بيتك' },
    ];
  }, [user, perks, onNavigate]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => setIndex(0), [messages[0].key]);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % messages.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, messages.length]);

  const m = messages[index % messages.length];
  const content = (
    <>
      <m.Icon className="size-3.5 shrink-0 md:size-4" aria-hidden="true" />
      <span className="truncate">{m.text}</span>
      {m.action && <ChevronLeft className="size-3.5 shrink-0 opacity-80" aria-hidden="true" />}
    </>
  );

  return (
    <div
      className="bg-primary text-primary-foreground"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mx-auto flex h-8 max-w-7xl items-center justify-center gap-3 px-4 text-xs md:h-9 md:text-sm">
        <div key={m.key} className="flex min-w-0 animate-fade-up items-center justify-center motion-reduce:animate-none" aria-live="polite">
          {m.action ? (
            <button
              type="button"
              onClick={m.action}
              className={cn(
                'flex min-w-0 items-center gap-1.5 rounded-sm font-medium underline-offset-4 hover:underline',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60'
              )}
            >
              {content}
            </button>
          ) : (
            <p className="flex min-w-0 items-center gap-1.5">{content}</p>
          )}
        </div>
        {/* Which message, and a way to pick one */}
        <div className="hidden shrink-0 items-center gap-1 sm:flex" role="tablist" aria-label="رسائل الشريط">
          {messages.map((msg, i) => (
            <button
              key={msg.key}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={msg.text}
              onClick={() => setIndex(i)}
              className={cn('size-1.5 rounded-full transition-all', i === index ? 'w-3 bg-primary-foreground' : 'bg-primary-foreground/40')}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
