import type { CartLine, OrderResult, Product } from '@/types';
import { CURRENCY_ISO } from './utils';

// Meta (Facebook) Pixel — admin-configurable from the dashboard, applies to
// every page and product automatically because every call here reads real
// product/order data already in hand at the call site (see App.tsx /
// CartSection.tsx), never a hardcoded list. A product added in Odoo tomorrow
// is tracked correctly with zero changes here.

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
    _fbq?: unknown;
  }
}

let initialized = false;

/** Inserts Meta's loader script and calls fbq('init', ...). Safe to call once. */
export function initPixel(pixelId: string) {
  if (initialized || !pixelId || typeof window === 'undefined') return;
  initialized = true;

  // Meta's standard bootstrap snippet, unmodified apart from formatting.
  (function (f: Window, b: Document, e: string, v: string) {
    let n: Window['fbq'];
    let t: HTMLScriptElement;
    let s: Element | null;
    if (f.fbq) return;
    n = function (...args: unknown[]) {
      // @ts-expect-error — mirrors Meta's own snippet exactly
      n.callMethod ? n.callMethod.apply(n, args) : n.queue!.push(args);
    } as Window['fbq'];
    f.fbq = n;
    if (!f._fbq) f._fbq = n;
    n!.queue = [];
    t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s?.parentNode?.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  window.fbq?.('init', pixelId);
}

function track(event: string, params?: Record<string, unknown>) {
  if (!initialized) return;
  window.fbq?.('track', event, params);
}

export function trackPageView() {
  track('PageView');
}

export function trackViewContent(product: Product) {
  track('ViewContent', {
    content_ids: [product.id],
    content_type: 'product',
    content_name: product.name,
    value: product.price,
    currency: CURRENCY_ISO,
  });
}

export function trackAddToCart(product: Product) {
  track('AddToCart', {
    content_ids: [product.id],
    content_type: 'product',
    content_name: product.name,
    contents: [{ id: product.id, quantity: 1 }],
    value: product.price,
    currency: CURRENCY_ISO,
  });
}

function contentsOf(lines: CartLine[]) {
  return lines.map((l) => ({ id: l.id, quantity: l.qty }));
}

export function trackInitiateCheckout(lines: CartLine[], total: number) {
  track('InitiateCheckout', {
    content_ids: lines.map((l) => l.id),
    content_type: 'product',
    contents: contentsOf(lines),
    num_items: lines.reduce((n, l) => n + l.qty, 0),
    value: total,
    currency: CURRENCY_ISO,
  });
}

export function trackPurchase(order: OrderResult, lines: CartLine[]) {
  track('Purchase', {
    content_ids: lines.map((l) => l.id),
    content_type: 'product',
    contents: contentsOf(lines),
    num_items: lines.reduce((n, l) => n + l.qty, 0),
    value: order.total,
    currency: CURRENCY_ISO,
  });
}
