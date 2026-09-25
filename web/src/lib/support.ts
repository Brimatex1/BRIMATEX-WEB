import type { SupportTopic } from '@/types';

/**
 * Opens the customer-care form from anywhere on the page. The floating button
 * shows only where a visitor browses (home, the shop); everywhere else the
 * form opens from where the question comes up - a product, the cart, an
 * order - already filled in with what we know.
 */
const EVENT = 'brimatex:open-support';

export interface OpenSupportDetail {
  /** Pre-fills the message (the product being asked about). */
  message?: string;
  /** Pre-selects the topic. */
  topic?: SupportTopic;
  /** Pre-fills the order number (topic "order"). */
  orderName?: string;
}

export function openSupport(detail: OpenSupportDetail = {}) {
  window.dispatchEvent(new CustomEvent<OpenSupportDetail>(EVENT, { detail }));
}

export function onOpenSupport(handler: (detail: OpenSupportDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<OpenSupportDetail>).detail ?? {});
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
