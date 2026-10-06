import type { CartLine, OrderResult, Product } from '@/types';
import { CURRENCY_ISO } from './utils';
import { matchData, type PixelPerson } from '@/lib/pixelMatch';
import { visitorId } from '@/lib/visitor';

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
/** initPixel was called and waits for the visitor's details before starting. */
let starting = false;
/** The visitor's hashed details being computed (setPixelPerson). */
let personReady: Promise<void> | null = null;
/** Meta's Parameter Builder collecting _fbc, _fbp and the visitor's own IP (collectParams). */
let paramsReady: Promise<void> | null = null;

/**
 * Where the browser learns its own address. This host has no IPv6, so the
 * server only ever sees the visitor's IPv4 - shared by many phones on Libyan
 * carriers, which Meta flags ("client IP addresses associated with multiple
 * users"). This dual-stack service answers with the phone's IPv6 when it has
 * one (its IPv4 otherwise) - the lookup Meta's own example uses. Once the
 * site itself answers over IPv6, the server sees the IPv6 directly and this
 * can go.
 */
const IP_LOOKUP = 'https://api64.ipify.org';

/** Set when the lookup failed (an ad blocker, say): not tried again this visit. */
const LOOKUP_FAILED_KEY = 'brimatex:ip-lookup-failed';
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]{2,39}$/i;

/**
 * The visitor's address, or '' - it never throws. Meta's library writes an
 * error to the console for a lookup that fails or answers something that is
 * not an address, so it only ever gets one that is.
 */
async function lookupIp(): Promise<string> {
  try {
    if (sessionStorage.getItem(LOOKUP_FAILED_KEY)) return '';
  } catch {
    /* storage blocked - try anyway */
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch(IP_LOOKUP, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
    const ip = res.ok ? (await res.text()).trim() : '';
    if (IPV4.test(ip) || (ip.includes(':') && IPV6.test(ip))) return ip;
  } catch {
    /* blocked, offline or too slow */
  } finally {
    clearTimeout(timer);
  }
  try {
    sessionStorage.setItem(LOOKUP_FAILED_KEY, '1');
  } catch {
    /* storage blocked */
  }
  return '';
}

/**
 * Meta's Parameter Builder (developers.facebook.com/documentation/ads-commerce/
 * conversions-api/parameter-builder-library): keeps _fbc from the ad click
 * (and from Facebook's in-app browser when the address lost it), _fbp, and
 * the visitor's own IP in the _fbi cookie for a day - which every request to
 * this site carries, so the server sends Meta that address
 * (src/lib/clientIp.js). The lookup runs once a day per browser, not per page.
 */
function collectParams(): Promise<void> {
  if (!paramsReady) {
    paramsReady = (async () => {
      try {
        // Its own small file, fetched here: only the Pixel needs it, after the page is up.
        const { default: clientParamBuilder } = await import('meta-capi-param-builder-clientjs');
        // The address is looked up first: the library is handed one only when there is one.
        const ip = clientParamBuilder.getClientIpAddress() ? '' : await lookupIp();
        await clientParamBuilder.processAndCollectAllParams(window.location.href, ip ? () => ip : undefined);
      } catch {
        /* cookies blocked or the lookup failed - the server uses the request's address */
      }
    })();
  }
  return paramsReady;
}
/**
 * The Pixel ID arrives from the server a moment after the page loads, and a
 * visitor landing on a product from an ad fires ViewContent before that. Such
 * events wait here, then go out on init - or are dropped if no Pixel is set.
 */
type Params = Record<string, unknown> | undefined;
/** fbq's fourth argument. `eventID` pairs a browser event with its server copy. */
type Options = { eventID?: string } | undefined;
/** [event, params, options, custom] - custom events go out with fbq('trackCustom'). */
let pending: [string, Params, Options, boolean][] | null = [];

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
  if (initialized || starting || !pixelId || typeof window === 'undefined') return;
  // Only the live shop reports: a copy running on a developer's machine or a
  // test server sent its visits to the same Pixel (Events Manager listed
  // localhost and 127.0.0.1 beside brimatex.ly).
  if (!isLiveHost(window.location.hostname)) return disablePixel();
  // The visitor's hashed details (external_id, country - and phone, name and
  // city when known) are computed asynchronously; the first PageView used to
  // leave before them, so only part of the events carried them. Wait for
  // them (never more than 1.5 s), then start and send what queued meanwhile.
  starting = true;
  // Meta's Parameter Builder too: the first events then carry the visitor's own address.
  const ready = Promise.all([(personReady ?? Promise.resolve()).catch(() => undefined), collectParams()]);
  void Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]).then(() => start(pixelId, rate));
}

function start(pixelId: string, rate?: number | null) {
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

  // The Pixel counts a PageView on its own at every history change - each
  // screen, and each letter typed in the shop's search (the query lives in the
  // URL). Those carry no event ID of ours, so their server copies never pair
  // with the Pixel's and every screen was counted twice. The app sends its
  // own PageView per screen (App.tsx), with the ID its server copy shares -
  // which the Pixel drops after the first of a page load unless told that
  // more than one is meant.
  if (window.fbq) {
    const flags = window.fbq as unknown as { disablePushState?: boolean; allowDuplicatePageViews?: boolean };
    flags.disablePushState = true;
    flags.allowDuplicatePageViews = true;
  }

  activePixelId = pixelId;
  window.fbq?.('init', pixelId, personData ?? undefined);
  for (const [event, params, options, custom] of pending ?? []) send(event, params, options, custom);
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
      // Who this is, hashed here (lib/pixelMatch.ts) - a guest who typed their
      // phone at checkout is matched on the server copy too. Hex digests only.
      user_data: personData ?? undefined,
    }),
  }).catch(() => {});
}

/** Converts at send time, so events queued before the rate arrived are converted too. */
function send(event: string, params?: Params, options?: Options, custom = false) {
  const eventID = options?.eventID ?? newEventId(event);
  relay(event, eventID, params);
  if (params && lydPerUsd && params.currency === CURRENCY_ISO && typeof params.value === 'number') {
    params = { ...params, value: Math.round((params.value / lydPerUsd) * 100) / 100, currency: 'USD' };
  }
  window.fbq?.(custom ? 'trackCustom' : 'track', event, params, { ...options, eventID });
}

/*
 * A guest's hashed details stay on this device for 90 days - a returning
 * visitor who ordered before is still matched by their phone. Hashes only;
 * cleared on signing out.
 */
const STORED_PERSON = 'brx_am';
const STORED_DAYS = 90;

function storedPerson(): Record<string, string> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORED_PERSON) || 'null');
    if (saved && Date.now() - saved.at < STORED_DAYS * 86_400_000 && saved.data && typeof saved.data === 'object') return saved.data;
  } catch {
    /* storage blocked or corrupt */
  }
  return null;
}

function storePerson(data: Record<string, string> | null) {
  try {
    if (data) localStorage.setItem(STORED_PERSON, JSON.stringify({ data, at: Date.now() }));
    else localStorage.removeItem(STORED_PERSON);
  } catch {
    /* storage blocked - matching still works for this visit */
  }
}

/**
 * Advanced Matching: tells the Pixel who the visitor is - a signed-in
 * customer, a guest who has typed their details at checkout, or at least
 * this browser's own visitor ID - hashed (lib/pixelMatch.ts). Before the
 * Pixel starts, the data waits for init; after, a re-init with the same ID
 * updates it, as Meta documents for pages that learn who the visitor is
 * later. Awaited before a purchase is tracked, so the Purchase carries it.
 *
 * Null: nobody signed in - a guest known from an earlier checkout on this
 * device, else just the visitor ID.
 */
export function setPixelPerson(person: PixelPerson | null): Promise<void> {
  const work = computePerson(person);
  personReady = work;
  return work;
}

async function computePerson(person: PixelPerson | null) {
  if (typeof window === 'undefined' || !crypto?.subtle) return;
  const vid = visitorId();
  try {
    if (person) {
      personData = await matchData({ ...person, visitorId: vid });
      // A guest's own details are kept for their next visit; an account's come from the account.
      if (!person.id && person.phone) storePerson(personData);
    } else {
      personData = storedPerson() ?? (await matchData({ visitorId: vid }));
    }
  } catch {
    return;
  }
  if (initialized && activePixelId) window.fbq?.('init', activePixelId, personData ?? {});
}

/** Signing out: this device forgets the person - only the visitor ID is left. */
export async function forgetPixelPerson() {
  storePerson(null);
  await setPixelPerson(null);
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

function track(event: string, params?: Params, options?: Options, custom = false) {
  if (initialized) send(event, params, options, custom);
  else pending?.push([event, params, options, custom]);
}

export function trackPageView() {
  track('PageView');
}

/**
 * A product page: reported as the size it opens on - the one in its address
 * (a catalogue ad links to a size), else the first of the owner's main sizes
 * (src/lib/sizes.js on the server orders them) - so the ad that brought the
 * visitor is the item credited.
 */
export function trackViewContent(product: Product, opened?: { id: number; price: number }) {
  const size = opened ?? product.variants?.[0];
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

/**
 * Checkout started. `eventID` (ic_<cart>_<time>) is the one the server's copy
 * carries too, so Meta keeps one of the two.
 */
export function trackInitiateCheckout(lines: CartLine[], total: number, eventID?: string) {
  track('InitiateCheckout', {
    content_ids: lines.map((l) => l.id),
    content_type: 'product',
    contents: contentsOf(lines),
    num_items: lines.reduce((n, l) => n + l.qty, 0),
    value: total,
    currency: CURRENCY_ISO,
  }, eventID ? { eventID } : undefined);
}

/* One InitiateCheckout per checkout: a cart's own ID, and the cart it was sent for. */
const CART_ID_KEY = 'brimatex:cart-id';
const CHECKOUT_SENT_KEY = 'brimatex:checkout-sent';

function cartId(): string {
  try {
    let id = localStorage.getItem(CART_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem(CART_ID_KEY, id);
    }
    return id;
  } catch {
    return 'nocart';
  }
}

/** The cart as it stands - the same lines in any order give the same text. */
function cartSignature(lines: CartLine[]): string {
  return lines.map((l) => `${l.id}x${l.qty}`).sort().join(',');
}

/**
 * InitiateCheckout once per checkout: going back to the cart and returning
 * with the same cart sends nothing; a changed cart is a new checkout. Returns
 * the event ID sent, or null when this cart was already counted.
 */
export function trackCheckoutOnce(lines: CartLine[], total: number): string | null {
  const signature = `${cartId()}:${cartSignature(lines)}`;
  try {
    if (sessionStorage.getItem(CHECKOUT_SENT_KEY) === signature) return null;
    sessionStorage.setItem(CHECKOUT_SENT_KEY, signature);
  } catch {
    /* storage blocked - the page's own guard still sends it once per visit */
  }
  const eventID = `ic_${cartId()}_${Date.now()}`;
  trackInitiateCheckout(lines, total, eventID);
  return eventID;
}

/** After an order: the next cart is a new one, with its own checkout. */
export function forgetCheckout() {
  try {
    localStorage.removeItem(CART_ID_KEY);
    sessionStorage.removeItem(CHECKOUT_SENT_KEY);
  } catch {
    /* storage blocked */
  }
}

/**
 * The event ID matches the one the server sends through the Conversions API
 * (src/lib/meta-capi.js), so Meta counts this purchase once, not twice.
 */
const PURCHASED_KEY = 'brimatex:purchased';

/** An order already reported from this browser (a retry, a second tab): never twice. */
function firstReportOf(orderName: string): boolean {
  try {
    const done: string[] = JSON.parse(localStorage.getItem(PURCHASED_KEY) || '[]');
    if (done.includes(orderName)) return false;
    localStorage.setItem(PURCHASED_KEY, JSON.stringify([orderName, ...done].slice(0, 20)));
  } catch {
    /* storage blocked - the checkout sends it once anyway */
  }
  return true;
}

export function trackPurchase(order: OrderResult, lines: CartLine[]) {
  if (!firstReportOf(order.orderName)) return;
  // No num_items here: Meta's reference keeps it for InitiateCheckout.
  track('Purchase', {
    content_ids: lines.map((l) => l.id),
    content_type: 'product',
    contents: contentsOf(lines),
    value: order.total,
    currency: CURRENCY_ISO,
  }, { eventID: `purchase-${order.orderName}` });
}

/** A search on the shop - what the visitor looked for, for Meta's search audiences. */
export function trackSearch(query: string) {
  const q = query.trim();
  if (q.length < 2) return;
  track('Search', { search_string: q.slice(0, 100) });
}

/** A mattress saved to favourites - reported as the size its page opens on. */
export function trackAddToWishlist(product: Product) {
  const size = product.variants?.[0];
  track('AddToWishlist', {
    content_ids: [size?.id ?? product.id],
    content_type: 'product',
    content_name: product.name,
    value: size?.price ?? product.price,
    currency: CURRENCY_ISO,
  });
}

/** An account made - after the WhatsApp code, when the customer is really someone. */
export function trackCompleteRegistration() {
  track('CompleteRegistration', { content_name: 'account', status: true });
}

/**
 * A category of mattresses opened (a tier) - custom, as Meta has no standard
 * event for it; its content_ids let catalogue ads follow the browsing.
 */
export function trackViewCategory(category: string, productIds: number[]) {
  track(
    'ViewCategory',
    { content_category: category, content_ids: productIds.slice(0, 10), content_type: 'product' },
    undefined,
    true
  );
}

/**
 * Checkout, cash on delivery: the customer has given a valid name and phone -
 * the "payment details" of a COD order. Fired once, before they confirm, so a
 * checkout left there is still a known person to Meta.
 */
export function trackAddPaymentInfo(lines: CartLine[], total: number) {
  track('AddPaymentInfo', {
    content_ids: lines.map((l) => l.id),
    content_type: 'product',
    contents: contentsOf(lines),
    value: total,
    currency: CURRENCY_ISO,
  });
}

/**
 * The customer reaching out - Meta's standard event. The channel: the support
 * form, or the WhatsApp / phone buttons on the help and showroom pages.
 */
export function trackContact(channel: 'support_form' | 'whatsapp' | 'phone' = 'support_form') {
  track('Contact', { contact_channel: channel });
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
