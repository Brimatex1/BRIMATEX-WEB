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

export type StepState = 'done' | 'current' | 'upcoming';

export interface TrackStep {
  key: Exclude<Stage, 'cancelled'>;
  /** The step's name on the tracker. */
  label: string;
  /** The detail panel: what this step means for this order. */
  title: string;
  body: string;
  /** A real date only - never an invented one. */
  when: string | null;
  /** References the customer can quote to us: invoice, delivery slip. */
  refs: { label: string; value: string }[];
  state: StepState;
}

export interface Tracking {
  stage: Stage;
  /** The big line at the top: where the order is now. */
  headline: string;
  sub: string;
  steps: TrackStep[];
  /** Index of the current step (the last reached one). */
  current: number;
  /** A made-to-order mattress: when it should be ready, while still being made. */
  readyBy: string | null;
}

export function formatDay(iso: string | null | undefined, withTime = false): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('ar-LY', {
    weekday: withTime ? undefined : 'long',
    month: 'long',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

const ORDER: TrackStep['key'][] = ['review', 'confirmed', 'shipping', 'done'];

export function trackingOf(order: OrderSummary): Tracking {
  const stage = stageOf(order);
  const current = stage === 'cancelled' ? 0 : ORDER.indexOf(stage);
  const leadDays = order.leadDays ?? null;
  const readyBy =
    leadDays && (stage === 'review' || stage === 'confirmed')
      ? formatDay(new Date(new Date(order.placedAt).getTime() + leadDays * 86_400_000).toISOString())
      : null;
  const madeToOrder = leadDays !== null;
  // Odoo's invoice number; the demo store's own "INV-123456" is not one to quote.
  const invoice = order.invoiceName && !order.invoiceName.startsWith('INV-') ? order.invoiceName : null;

  const state = (i: number): StepState => (i < current ? 'done' : i === current ? (stage === 'done' ? 'done' : 'current') : 'upcoming');

  const steps: TrackStep[] = [
    {
      key: 'review',
      label: 'استلمناه',
      title: 'استلمنا طلبك',
      body: 'وصل طلبك إلينا. الفريق يراجعه ويتصل بك لتأكيد العنوان والموعد.',
      when: formatDay(order.placedAt, true),
      refs: [],
      state: state(0),
    },
    {
      key: 'confirmed',
      label: madeToOrder ? 'يُصنع' : 'نجهّزه',
      title: madeToOrder ? 'مرتبتك تُصنع لك' : 'نجهّز طلبك',
      body: madeToOrder
        ? `أكّدنا طلبك، ومرتبتك تُصنع لك خصيصاً${leadDays ? ` خلال ${leadDays} ${leadDays > 10 ? 'يوماً' : 'أيام'}` : ''}. نخبرك أول ما تطلع من المخزن.`
        : 'أكّدنا طلبك ونجهّزه في المخزن. نخبرك أول ما يطلع مع السائق.',
      when: readyBy ? `جاهزة تقريباً ${readyBy}` : null,
      refs: [],
      state: state(1),
    },
    {
      key: 'shipping',
      label: 'في الطريق',
      title: 'طلبك في الطريق',
      body: 'طلع من المخزن مع السائق. يتصل بك قبل الوصول، والدفع عند الاستلام.',
      when: formatDay(order.shippedAt, true),
      refs: [
        ...(order.shipmentName ? [{ label: 'إذن التسليم', value: order.shipmentName }] : []),
        ...(invoice ? [{ label: 'الفاتورة', value: invoice }] : []),
      ],
      state: state(2),
    },
    {
      key: 'done',
      label: 'وصل',
      title: 'تم التسليم',
      body: 'وصلت مرتبتك. نوماً هنيئاً، وتذكّر تقليبها كل ثلاثة أشهر.',
      when: formatDay(order.paidAt, true),
      refs: invoice ? [{ label: 'الفاتورة', value: invoice }] : [],
      state: state(3),
    },
  ];

  const HEAD: Record<Stage, [string, string]> = {
    review: ['استلمنا طلبك', 'نراجعه ونتصل بك قريباً لتأكيده.'],
    confirmed: madeToOrder
      ? ['مرتبتك تُصنع', readyBy ? `جاهزة تقريباً ${readyBy}.` : 'نخبرك أول ما تطلع من المخزن.']
      : ['نجهّز طلبك', 'نخبرك أول ما يطلع مع السائق.'],
    shipping: ['طلبك في الطريق', 'السائق يتصل بك قبل الوصول.'],
    done: ['وصل طلبك', 'نوماً هنيئاً.'],
    cancelled: ['أُلغي الطلب', 'تواصل معنا ونرتّب لك طلباً بديلاً أو موعداً أنسب.'],
  };

  return { stage, headline: HEAD[stage][0], sub: HEAD[stage][1], steps, current, readyBy };
}
