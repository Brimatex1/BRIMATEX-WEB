import { formatPrice } from '@/lib/utils';
import type { OrderSummary } from '@/types';

/**
 * An order's stage as the customer understands it. The server derives it from
 * the sale order in Odoo (src/lib/orderSync.js): the team confirms the order,
 * the warehouse validates its delivery slip when the goods leave with the
 * driver, the payment is recorded on the invoice. Mirrors the app's
 * src/features/orderStatus.ts - the two must agree on every word.
 */
export type Stage = 'review' | 'confirmed' | 'shipping' | 'done' | 'cancelled';

export function stageOf(order: Pick<OrderSummary, 'invoiceStatus' | 'paymentStatus'>): Stage {
  if (order.invoiceStatus === 'cancel' || order.invoiceStatus === 'cancelled') return 'cancelled';
  if (order.paymentStatus === 'paid') return 'done';
  if (order.invoiceStatus === 'confirmed') return 'confirmed';
  if (order.invoiceStatus === 'posted' || order.invoiceStatus === 'delivered') return 'shipping';
  return 'review';
}

/**
 * What the customer is told: the stage, with "confirmed" split in two - a
 * mattress made to order is being made, anything else is being prepared.
 */
export type Status = 'review' | 'preparing' | 'making' | 'shipping' | 'done' | 'cancelled';

export function statusOf(order: OrderSummary): Status {
  const stage = stageOf(order);
  if (stage === 'confirmed') return order.leadDays != null ? 'making' : 'preparing';
  return stage;
}

/** "الاثنين 5 أكتوبر" - the weekday without the comma the locale puts after it. */
export function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('ar-LY', { weekday: 'long', day: 'numeric', month: 'long' }).replace('،', '');
}

/** "السبت 20 سبتمبر · 7:29 م" */
export function formatMoment(iso: string | null | undefined): string | null {
  const day = formatDay(iso);
  if (!day) return null;
  const time = new Date(iso as string).toLocaleTimeString('ar-LY', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

interface Context {
  /** When a made-to-order mattress should be ready. */
  expected: string | null;
  /** The amount due on delivery, when there is one. */
  due: number | null;
  /** When it was delivered. */
  deliveredAt: string | null;
}

/**
 * Every status's words, in one place: the badge (also the active step's
 * name), the headline, and the line under it (null: no second line).
 */
export const STATUS: Record<Status, { badge: string; title: string; sub: (c: Context) => string | null }> = {
  review: {
    badge: 'بانتظار التأكيد',
    title: 'استلمنا طلبك',
    sub: () => 'سنتصل بك قريباً لتأكيد العنوان وموعد التوصيل.',
  },
  preparing: {
    badge: 'قيد التجهيز',
    title: 'نجهّز طلبك',
    sub: (c) => (c.expected ? `التوصيل المتوقع: ${c.expected}` : null),
  },
  making: {
    badge: 'قيد التصنيع',
    title: 'نصنع مرتبتك الآن',
    sub: (c) => (c.expected ? `جاهزة في موعد أقصاه ${c.expected}` : null),
  },
  shipping: {
    badge: 'في الطريق',
    title: 'طلبك في الطريق إليك',
    sub: (c) => `سيتصل بك السائق قبل الوصول.${c.due ? ` الدفع عند الاستلام: ${formatPrice(c.due)} د.ل` : ''}`,
  },
  done: {
    badge: 'تم التوصيل',
    title: 'تم توصيل طلبك',
    sub: (c) => c.deliveredAt,
  },
  cancelled: {
    badge: 'ملغى',
    title: 'تم إلغاء الطلب',
    sub: () => 'تواصل معنا لإعادة الطلب أو اختيار موعد آخر.',
  },
};

/** Shown under a delivered order's tracker. */
export const AFTER_DELIVERY_TIP = '💡 اقلب مرتبتك كل 3 أشهر لتدوم أطول.';

export type StepState = 'done' | 'current' | 'upcoming';

export interface TrackStep {
  key: 'review' | 'confirmed' | 'shipping' | 'done';
  label: string;
  /** When it happened - a real date only, never an invented one. */
  when: string | null;
  /** Documents the customer can quote to us: the invoice. */
  docs: { label: string; value: string }[];
  state: StepState;
}

export interface Tracking {
  status: Status;
  badge: string;
  headline: string;
  sub: string | null;
  steps: TrackStep[];
  /** Index of the current step (the last reached one). */
  current: number;
}

const STEP_KEYS: TrackStep['key'][] = ['review', 'confirmed', 'shipping', 'done'];

export function trackingOf(order: OrderSummary): Tracking {
  const stage = stageOf(order);
  const status = statusOf(order);
  const current = stage === 'cancelled' ? 0 : STEP_KEYS.indexOf(stage);
  const leadDays = order.leadDays ?? null;
  const expected =
    leadDays && (stage === 'review' || stage === 'confirmed')
      ? formatDay(new Date(new Date(order.placedAt).getTime() + leadDays * 86_400_000).toISOString())
      : null;
  // Odoo's invoice number; the demo store's own "INV-123456" is not one to quote.
  const invoice = order.invoiceName && !order.invoiceName.startsWith('INV-') ? order.invoiceName : null;
  const docs = invoice ? [{ label: 'الفاتورة', value: invoice }] : [];
  const context: Context = {
    expected,
    due: order.paymentStatus !== 'paid' && order.total > 0 ? order.total : null,
    deliveredAt: formatMoment(order.paidAt),
  };

  const state = (i: number): StepState =>
    i < current ? 'done' : i === current ? (stage === 'done' ? 'done' : 'current') : 'upcoming';

  const steps: TrackStep[] = [
    { key: 'review', label: 'تم الطلب', when: formatMoment(order.placedAt), docs: [], state: state(0) },
    {
      key: 'confirmed',
      label: STATUS[leadDays != null ? 'making' : 'preparing'].badge,
      when: null,
      docs: [],
      state: state(1),
    },
    { key: 'shipping', label: STATUS.shipping.badge, when: formatMoment(order.shippedAt), docs, state: state(2) },
    { key: 'done', label: STATUS.done.badge, when: formatMoment(order.paidAt), docs, state: state(3) },
  ];

  return {
    status,
    badge: STATUS[status].badge,
    headline: STATUS[status].title,
    sub: STATUS[status].sub(context),
    steps,
    current,
  };
}

/** "منتج واحد" / "منتجان" / "3 منتجات" / "11 منتجاً" */
export function itemsText(n: number): string {
  if (n === 1) return 'منتج واحد';
  if (n === 2) return 'منتجان';
  if (n >= 3 && n <= 10) return `${n} منتجات`;
  return `${n} منتجاً`;
}
