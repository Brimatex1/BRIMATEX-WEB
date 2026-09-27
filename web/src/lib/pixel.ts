import type { CartLine, OrderResult, Product } from '@/types';
import { CURRENCY_ISO } from './utils';
import { matchData, type PixelPerson } from '@/lib/pixelMatch';

// Meta (Facebook) Pixel — admin-configurable from the dashboard, applies to
// every page and product automatically because every call here reads real
// product/order data already in hand at the call site (see App.tsx /
// components/app/CartScreen.tsx), never a hardcoded list. A product added in Odoo tomorrow
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
/** The Pixel ID once initialised - Advanced Matching re-inits with it when the visitor becomes known. */
let activePixelId: string | null = null;
/** Hashed person fields (lib/pixelMatch.ts) - sent with init, or with a re-init once known. */
let personData: Record<string, string> | null = null;

/**
 * Inserts Meta's loader script and calls fbq('init', ...). Safe to call once.
 *
 * `rate` (dinars per dollar) converts event values to USD, because Meta does
 * not accept LYD. This touches only what is sent to Meta - never a price the
 * customer sees.
 */
export function initPixel(pixelId: string, rate?: number | null) {
  if (initialized || !pixelId || typeof window === 'undefined') return;
  // Only the live shop reports: a copy running on a developer's machine or a
  // test server sent its visits to the same Pixel (Events Manager listed
  // localhost and 127.0.0.1 beside brimatex.ly).
  if (!isLiveHost(window.location.hostname)) return disablePixel();
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

  activePixelId = pixelId;
  window.fbq?.('init', pixelId, personData ?? undefined);
  for (const [event, params, options] of pending ?? []) send(event, params, options);
  pending = null;
}

/** A fresh event ID - the one the browser event and its server copy share. */
function newEventId(event: string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${event}.${Date.now()}.${random}`;
}

/**
 * The server's copy of a Pixel event (src/routes/metaEvents.js), sent on to
 * Meta's Conversions API with the same event ID - Meta keeps one of the two.
 * It still arrives when an ad blocker or iOS stops the Pixel ("event
 * coverage" in Events Manager). Values go in dinars; the server converts them
 * as this file does. Purchase is left out: the order itself reports it.
 */
function relay(event: string, eventID: string, params?: Params) {
  if (event === 'Purchase') return;
  let token: string | null = null;
  try {
    token = localStorage.getItem('auth_token');
  } catch {
    /* storage blocked - the event goes without the customer's details */
  }
  const { eventSourceUrl, referrerUrl, fbp, fbc } = trackingContext();
  void fetch('/api/meta/events', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      event_name: event,
      event_id: eventID,
      event_source_url: eventSourceUrl,
      referrer_url: referrerUrl,
      fbp,
      fbc,
      custom_data: params,
    }),
  }).catch(() => {});
}

/** Converts at send time, so events queued before the rate arrived are converted too. */
function send(event: string, params?: Params, options?: Options) {
  const eventID = options?.eventID ?? newEventId(event);
  relay(event, eventID, params);
  if (params && lydPerUsd && params.currency === CURRENCY_ISO && typeof params.value === 'number') {
    params = { ...params, value: Math.round((params.value / lydPerUsd) * 100) / 100, currency: 'USD' };
  }
  window.fbq?.('track', event, params, { ...options, eventID });
}

/**
 * Advanced Matching: tells the Pixel who the visitor is - a signed-in
 * customer, or one who has just typed their details at checkout - hashed
 * (lib/pixelMatch.ts). Before the Pixel starts, the data waits for init;
 * after, a re-init with the same ID updates it, as Meta documents for pages
 * that learn who the visitor is later. Awaited before a purchase is tracked,
 * so the Purchase event carries it. Null forgets the person (signing out).
 */
export async function setPixelPerson(person: PixelPerson | null) {
  if (typeof window === 'undefined' || !crypto?.subtle) return;
  try {
    personData = person ? await matchData(person) : null;
  } catch {
    return;
  }
  if (initialized && activePixelId) window.fbq?.('init', activePixelId, personData ?? {});
}

/** The shop's own address - brimatex.ly or a subdomain of it. */
export function isLiveHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === 'brimatex.ly' || host.endsWith('.brimatex.ly');
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

/**
 * A product page: reported as the size it opens on - the first of the
 * owner's main sizes (src/lib/sizes.js on the server orders them) - so the
 * catalogue ads show the size most homes buy.
 */
export function trackViewContent(product: Product) {
  const size = product.variants?.[0];
  track('ViewContent', {
    content_ids: [size?.id ?? product.id],
    content_type: 'product',
    content_name: product.name,
    value: size?.price ?? product.price,
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

/** Each item as Meta's `contents` lists it - the shop delivers to the door (delivery_category). */
function contentsOf(lines: CartLine[]) {
  return lines.map((l) => ({ id: l.id, quantity: l.qty, delivery_category: 'home_delivery' }));
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
  // No num_items here: Meta's reference keeps it for InitiateCheckout.
  track('Purchase', {
    content_ids: lines.map((l) => l.id),
    content_type: 'product',
    contents: contentsOf(lines),
    value: order.total,
    currency: CURRENCY_ISO,
  }, { eventID: `purchase-${order.orderName}` });
}

/** A message sent to customer care - Meta's standard event for a customer reaching out. */
export function trackContact() {
  track('Contact', { contact_channel: 'support_form' });
}

/**
 * "Order on WhatsApp" on a product: a Contact carrying the size, as a cart
 * line would - so catalogue ads credit the product - and contact_channel
 * "whatsapp_order", which tells it apart from a question to customer care
 * (a custom conversion in Events Manager can count these alone).
 */
export function trackWhatsAppOrder(item: { id: number; name: string; price: number }) {
  track('Contact', {
    content_ids: [item.id],
    content_type: 'product',
    content_name: item.name,
    contents: [{ id: item.id, quantity: 1, delivery_category: 'home_delivery' }],
    value: item.price,
    currency: CURRENCY_ISO,
    contact_channel: 'whatsapp_order',
  });
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
    // Where the visitor came from - the landing page's referrer, which a
    // single-page site keeps for the whole visit.
    referrerUrl: document.referrer || undefined,
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc') || storedFbc,
  };
}
