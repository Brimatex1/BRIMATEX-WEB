// The loyalty programme, in the words and numbers the shop shows customers.
//
// The rules are the server's (src/lib/perks.js) - which a signed-in
// customer's perks carry as `points.rules`; a visitor gets these defaults,
// the same values. Change a rule there and here together.

import type { PointsSummary, Voucher } from '@/types';

export const DEFAULT_RULES: PointsSummary['rules'] = { perDinar: 1, stepPoints: 250, stepValue: 5, validDays: 90 };

/** The reward vouchers (src/lib/perks.js REWARDS), as the explainer lists them. */
export const REWARD_STEPS: { when: string; discount: string }[] = [
  { when: 'بعد أول طلب', discount: '5%' },
  { when: 'بعد 3 طلبات مدفوعة', discount: '10%' },
  { when: 'عند تقييم منتج اشتريته', discount: '5%' },
  { when: 'عند حفظ 5 منتجات في المفضّلة', discount: '5%' },
  { when: 'بعد 5 طلبات', discount: '10%' },
  { when: 'بعد 10 طلبات', discount: '15%' },
];

/** Points a purchase of `price` dinars earns. */
export function pointsFor(price: number, rules = DEFAULT_RULES): number {
  return Math.floor(Math.max(0, price) * rules.perDinar);
}

/** What `points` are worth in dinars, when redeemed. */
export function pointsValue(points: number, rules = DEFAULT_RULES): number {
  return Math.round((points / rules.stepPoints) * rules.stepValue * 100) / 100;
}

/** "1,050" - points written as prices are. */
export function formatPoints(points: number): string {
  return new Intl.NumberFormat('en-US').format(points);
}

/** Points still needed for the next voucher (0 when one can be redeemed now). */
export function pointsToNextVoucher(balance: number, rules = DEFAULT_RULES): number {
  return balance >= rules.stepPoints ? 0 : rules.stepPoints - balance;
}

/** The customer's best voucher still usable - the biggest discount, then the soonest to expire. */
export function bestActiveVoucher(vouchers: Voucher[] | undefined): Voucher | null {
  const active = (vouchers ?? []).filter((v) => v.state === 'active');
  active.sort((a, b) => b.discount - a.discount || new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime());
  return active[0] ?? null;
}

/*
 * One explainer on every page: any "points" tag, line or bar message opens it
 * (App.tsx mounts it once), as openSupport does for customer care.
 */
const EVENT = 'brimatex:open-loyalty';

export function openLoyalty() {
  window.dispatchEvent(new Event(EVENT));
}

export function onOpenLoyalty(handler: () => void): () => void {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
