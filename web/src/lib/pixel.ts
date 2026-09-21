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
/**
 * The Pixel ID arrives from the server a moment after the page loads, and a
 * visitor landing on a product from an ad fires ViewContent before that. Such
 * events wait here, then go out on init - or are dropped if no Pixel is set.
 */
let pending: [string, Record<string, unknown> | undefined][] | null = [];

/** Dinars to one dollar, from the dashboard. Null: report in LYD as-is. */
let lydPerUsd: number | null = null;

/**
 * Inserts Meta's loader script and calls fbq('init', ...). Safe to call once.
 *
 * `rate` (dinars per dollar) converts event values to USD, because Meta does
 * not accept LYD. This touches only what is sent to Meta - never a price the
 * customer sees.
 */
export function initPixel(pixelId: string, rate?: number | null) {
  if (initialized || !pixelId || typeof window === 'undefined') return;
  initialized = true;
  lydPerUsd = rate && rate > 0 ? rate : null;

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
  for (const [event, params] of pending ?? []) send(event, params);
  pending = null;
}

/** Converts at send time, so events queued before the rate arrived are converted too. */
function send(event: string, params?: Record<string, unknown>) {
  if (params && lydPerUsd && params.currency === CURRENCY_ISO && typeof params.value === 'number') {
    params = { ...params, value: Math.round((params.value / lydPerUsd) * 100) / 100, currency: 'USD' };
  }
  window.fbq?.('track', event, params);
}

/** No Pixel configured (or its config failed to load): stop holding events. */
export function disablePixel() {
  pending = null;
}

function track(event: string, params?: Record<string, unknown>) {
  if (initialized) send(event, params);
  else pending?.push([event, params]);
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
