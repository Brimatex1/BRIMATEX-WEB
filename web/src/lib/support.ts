/**
 * Opens the customer-care window from anywhere on the page - the phone layout's
 * "contact us" card and "ask about this product" button use it, as the iOS app
 * does. An optional message pre-fills the form (the product being asked about).
 */
const EVENT = 'brimatex:open-support';

export interface OpenSupportDetail {
  message?: string;
}

export function openSupport(detail: OpenSupportDetail = {}) {
  window.dispatchEvent(new CustomEvent<OpenSupportDetail>(EVENT, { detail }));
}

export function onOpenSupport(handler: (detail: OpenSupportDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<OpenSupportDetail>).detail ?? {});
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
