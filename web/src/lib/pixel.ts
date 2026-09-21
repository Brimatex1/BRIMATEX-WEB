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
type Params = Record<string, unknown> | undefined;
/** fbq's fourth argument. `eventID` pairs a browser event with its server copy. */
type Options = { eventID?: string } | undefined;
let pending: [string, Params, Options][] | null = [];

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
  for (const [event, params, options] of pending ?? []) send(event, params, options);
  pending = null;
}

/** Converts at send time, so events queued before the rate arrived are converted too. */
function send(event: string, params?: Params, options?: Options) {
  if (params && lydPerUsd && params.currency === CURRENCY_ISO && typeof params.value === 'number') {
    params = { ...params, value: Math.round((params.value / lydPerUsd) * 100) / 100, currency: 'USD' };
  }
  if (options) window.fbq?.('track', event, params, options);
  else window.fbq?.('track', event, params);
}

/** No Pixel configured (or its config failed to load): stop holding events. */
export function disablePixel() {
  pending = null;
}

function track(event: string, params?: Params, options?: Options) {
  if (initialized) send(event, params, options);
  else pending?.push([event, params, options]);
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

/**
 * The event ID matches the one the server sends through the Conversions API
 * (src/lib/meta-capi.js), so Meta counts this purchase once, not twice.
 */
export function trackPurchase(order: OrderResult, lines: CartLine[]) {
  track('Purchase', {
    content_ids: lines.map((l) => l.id),
    content_type: 'product',
    contents: contentsOf(lines),
    num_items: lines.reduce((n, l) => n + l.qty, 0),
    value: order.total,
    currency: CURRENCY_ISO,
  }, { eventID: `purchase-${order.orderName}` });
}

/** A message sent to customer care - Meta's standard event for a customer reaching out. */
export function trackContact() {
  track('Contact');
}

/* ------------------------------------------------ Conversions API context */

const CLICK_KEY = 'fb_click';
/** Meta attributes clicks for up to 7 days; a click ID older than that is useless. */
const CLICK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Keeps the ad click ID (fbclid) from the landing address. The Pixel stores it
 * in the _fbc cookie itself - but only when its script loads, and an ad
 * blocker stops exactly that. Kept here, the click still reaches Meta through
 * the server when the customer orders. Call once, at startup.
 */
export function captureClickId() {
  try {
    const fbclid = new URLSearchParams(window.location.search).get('fbclid');
    if (fbclid) {
      // Meta's documented _fbc format: fb.<subdomain index>.<ms>.<fbclid>
      localStorage.setItem(CLICK_KEY, JSON.stringify({ fbc: `fb.1.${Date.now()}.${fbclid}`, at: Date.now() }));
    }
  } catch {
    /* storage blocked - the _fbc cookie still covers most visitors */
  }
}

/** What the checkout sends with an order, for the server's Purchase event. */
export function trackingContext() {
  let storedFbc: string | undefined;
  try {
    const saved = JSON.parse(localStorage.getItem(CLICK_KEY) || 'null');
    if (saved && Date.now() - saved.at < CLICK_TTL_MS) storedFbc = saved.fbc;
  } catch {
    /* storage blocked or corrupt */
  }
  return {
    eventSourceUrl: window.location.href,
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc') || storedFbc,
  };
}
