/**
 * An order's five steps (handoff WebOrder): جديد · تم التأكيد · قيد التجهيز ·
 * خرج للتوصيل · تم التسليم - read from what the server knows (lib/orderStatus.ts:
 * confirmed in Odoo, the delivery slip validated, the payment recorded). The
 * same rules as the iOS app (brimatex-ios/src/orders/timeline.ts); times are
 * real ones only, never invented.
 */
import { formatMoment, stageOf } from '@/lib/orderStatus';
import type { OrderSummary } from '@/types';

import type { Tone } from './catalog';

export type StepKey = 'new' | 'confirmed' | 'preparing' | 'out' | 'delivered';

export interface Step {
  key: StepKey;
  label: string;
  state: 'done' | 'current' | 'upcoming';
  detail: string | null;
}

const LABELS: Record<StepKey, string> = {
  new: 'جديد',
  confirmed: 'تم التأكيد',
  preparing: 'قيد التجهيز',
  out: 'خرج للتوصيل',
  delivered: 'تم التسليم',
};
const ORDER: StepKey[] = ['new', 'confirmed', 'preparing', 'out', 'delivered'];

export function isCancelled(order: OrderSummary): boolean {
  return stageOf(order) === 'cancelled';
}

/** Which step is current: 0 placed, 2 confirmed and being prepared, 3 on its way, 4 delivered. */
export function currentStep(order: OrderSummary): number {
  const stage = stageOf(order);
  if (stage === 'done') return 4;
  if (stage === 'shipping' || order.shippedAt || order.shipmentName) return 3;
  if (stage === 'confirmed') return 2;
  return 0;
}

export function timeline(order: OrderSummary): Step[] {
  const current = currentStep(order);
  const all = current === 4;
  return ORDER.map((key, i) => {
    const state: Step['state'] = all || i < current ? 'done' : i === current ? 'current' : 'upcoming';
    let detail: string | null = null;
    if (key === 'new') detail = formatMoment(order.placedAt);
    if (key === 'out') detail = order.shippedAt ? formatMoment(order.shippedAt) : order.deliveryText && order.method !== 'pickup' ? `الوصول المتوقّع ${order.deliveryText}` : null;
    if (key === 'delivered') detail = order.paidAt ? formatMoment(order.paidAt) : null;
    return { key, label: key === 'out' && order.method === 'pickup' ? 'جاهز للاستلام' : LABELS[key], state, detail };
  });
}

/** The words on an order card, with the status's tone (blue on its way, amber being prepared, green delivered). */
export function statusLine(order: OrderSummary): { label: string; tone: Tone } {
  if (isCancelled(order)) return { label: 'ملغى', tone: 'destructive' };
  const step = currentStep(order);
  if (step === 4) return { label: order.method === 'pickup' ? 'تم الاستلام' : 'تم التسليم', tone: 'success' };
  if (step === 3) return { label: order.method === 'pickup' ? 'جاهز للاستلام' : 'خرج للتوصيل', tone: 'info' };
  if (step === 2) return { label: order.leadDays != null ? 'قيد التصنيع' : 'قيد التجهيز', tone: 'warning' };
  return { label: 'بانتظار التأكيد', tone: 'warning' };
}

/** Current orders on one tab, delivered and cancelled ones on the other. */
export function isPast(order: OrderSummary): boolean {
  return isCancelled(order) || currentStep(order) === 4;
}

/** It may still be cancelled: the server says so, else it has not left. */
export function canCancel(order: OrderSummary): boolean {
  if (typeof order.cancellable === 'boolean') return order.cancellable;
  return !isCancelled(order) && currentStep(order) < 3;
}
