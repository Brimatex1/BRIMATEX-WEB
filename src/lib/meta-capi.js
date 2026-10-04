/**
 * Meta Conversions API - the server-side twin of the browser Pixel.
 *
 * The Pixel runs on the customer's phone, and a good share of its events never
 * arrive: iOS tracking limits, ad blockers, a tab closed right after ordering.
 * This module sends the one event that matters most - Purchase - from the
 * server, where nothing can block it.
 *
 * Website orders only. App orders are not reported: the dataset is not
 * connected to an app in Meta, and app events would be rejected.
 *
 * Deduplication: the browser sends the same Purchase with the same event ID
 * (`purchase-<order name>`), so Meta counts one purchase, not two (48 h window;
 * Meta keeps the first copy it receives).
 *
 * Configuration. The access token (Events Manager > dataset > Settings >
 * Conversions API > Generate access token) is a secret: it is set from the
 * dashboard - stored on the server only, never shown again - or, failing
 * that, as FACEBOOK_CAPI_TOKEN in the server's .env (lib/settings.js).
 *
 *   FACEBOOK_TEST_EVENT_CODE   optional; routes events to Events Manager's
 *                              "Test events" tab instead of live data
 *   FACEBOOK_GRAPH_VERSION     optional; defaults to GRAPH_VERSION below
 *   FACEBOOK_GRAPH_URL         tests only; points the sender at a local mock
 *
 * The dataset (Pixel) ID and the LYD->USD rate come from the dashboard
 * (lib/settings.js), so the browser and the server always report to the same
 * dataset, in the same currency.
 *
 * Customer data follows Meta's normalisation rules and is SHA-256 hashed here;
 * only the IP address, user agent and the _fbp/_fbc browser IDs go unhashed,
 * as Meta requires.
 */
'use strict';

const crypto = require('crypto');
const { postRaw } = require('./http');
const { toInternational } = require('./whatsapp-cloud');
const { metaCity } = require('./metaCity');
const { visitorIdOf } = require('./visitor');
const { clientIp, sharedGuard, health: ipHealth } = require('./clientIp');

/** Latest Graph API version as of July 2026. */
const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v26.0';
const GRAPH_URL = process.env.FACEBOOK_GRAPH_URL || 'https://graph.facebook.com';
// The access token: set from the dashboard, or FACEBOOK_CAPI_TOKEN in .env
// (lib/settings.js) - read on every send, so a new one applies at once.
const settings = require('./settings');
const token = () => settings.getCapiToken();
const TEST_EVENT_CODE = process.env.FACEBOOK_TEST_EVENT_CODE || '';
const TIMEOUT_MS = 8000;

/** Last send outcome, shown in the dashboard - the only place a failure is visible. */
let lastResult = null;

function isConfigured() {
  return Boolean(token());
}

function status() {
  const t = settings.readPublicCapiToken();
  return {
    configured: isConfigured(),
    testMode: Boolean(TEST_EVENT_CODE),
    tokenSource: t.source,
    tokenLast4: t.last4,
    lastResult,
    ipHealth: ipHealth(),
  };
}

const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

/** Lowercase, trimmed, hashed - or undefined when empty, so the key is omitted. */
function hashed(value) {
  const v = String(value || '').trim().toLowerCase();
  return v ? sha256(v) : undefined;
}

/** Names: lowercase, punctuation removed (Arabic letters kept as UTF-8). */
function hashedName(value) {
  return hashed(String(value || '').replace(/[\p{P}\p{S}]/gu, ''));
}

/**
 * City: Latin, lowercase, no punctuation, no spaces - "طرابلس" -> "tripoli"
 * (lib/metaCity.js). Meta takes a list here, so a mapped city also goes as the
 * customer wrote it: a Facebook account may keep its city either way.
 */
function hashedCity(value) {
  const latin = metaCity(value);
  const asTyped = String(value || '').trim().toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
  const forms = [...new Set([latin, asTyped].filter(Boolean))];
  return forms.length ? forms.map(sha256) : undefined;
}

/**
 * First and last name. A compound first name ("عبد الله", "أبو بكر") is one
 * name, written joined - "عبدالله" - not "عبد". Same split as the browser's
 * web/src/lib/pixelMatch.ts.
 */
function nameParts(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 1 && /^(عبد|ابو|أبو)$/.test(words[0])) words.splice(0, 2, words[0] + words[1]);
  const [first = '', ...rest] = words;
  return { first, last: rest.length ? rest[rest.length - 1] : '' };
}

/** Phone: digits with the country code, no leading zeros - 0912345678 -> 218912345678. */
function hashedPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? sha256(toInternational(digits)) : undefined;
}

/** Reads one cookie from the request (the Pixel's first-party _fbp / _fbc). */
function cookie(req, name) {
  const match = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

// Where website events come from; event_source_url must be on the verified domain.
const SITE_URL = 'https://brimatex.ly/';

/**
 * A URL on the shop's own site, or undefined. Meta rejects an event_source_url
 * off the verified domain, and the browser's copy is only a claim.
 */
function siteUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return /(^|\.)brimatex\.ly$/.test(url.hostname) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Meta's click ID format, fb.<subdomain index>.<creation ms>.<fbclid>; anything else is dropped. */
function validFbc(value) {
  return /^fb\.\d\.\d{10,13}\..+$/.test(String(value || '')) ? value : undefined;
}

/** Meta's browser ID format, fb.<subdomain index>.<creation ms>.<random>. */
function validFbp(value) {
  return /^fb\.\d\.\d{10,13}\.\d+$/.test(String(value || '')) ? value : undefined;
}

/**
 * Every ID we know for this person, hashed, in one list - Meta takes several
 * and links them: the account when signed in, the browser's own visitor ID
 * (src/lib/visitor.js), the phone. The first is the one the browser Pixel
 * sends (web/src/lib/pixelMatch.ts): account, else visitor, else phone.
 */
function externalIds({ userId, visitorId, phoneHash, more = [] }) {
  const ids = [
    userId ? hashed(`user:${userId}`) : undefined,
    visitorId ? hashed(`visitor:${visitorId}`) : undefined,
    phoneHash,
    ...more,
  ].filter(Boolean);
  return ids.length ? [...new Set(ids)] : undefined;
}

/** A SHA-256 hex digest, as the browser sends its hashed fields; anything else is dropped. */
const HASH = /^[0-9a-f]{64}$/;
function hashOrNothing(value) {
  const v = String(value ?? '').toLowerCase();
  return HASH.test(v) ? v : undefined;
}

/**
 * The browser's Advanced Matching, already hashed there (web/src/lib/pixelMatch.ts):
 * a guest who typed their phone at checkout, a returning visitor. Only hex
 * digests pass - nothing readable is accepted from the browser.
 */
function browserMatch(user) {
  if (!user || typeof user !== 'object') return {};
  const list = (v) => (Array.isArray(v) ? v : [v]).map(hashOrNothing).filter(Boolean).slice(0, 5);
  return {
    ph: list(user.ph),
    em: list(user.em),
    fn: hashOrNothing(user.fn),
    ln: hashOrNothing(user.ln),
    ct: list(user.ct),
    external_id: list(user.external_id),
  };
}

function dropEmpty(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''));
}

/** LYD to what Meta receives: USD at the dashboard rate, or LYD when no rate is set. */
function money(lyd, lydPerUsd) {
  return lydPerUsd
    ? { value: Math.round((lyd / lydPerUsd) * 100) / 100, currency: 'USD' }
    : { value: lyd, currency: 'LYD' };
}

/**
 * Builds the Purchase event. Exported separately so tests can check the payload
 * without a network call.
 *
 * `tracking` comes from the website's checkout: { eventSourceUrl, referrerUrl,
 * fbp, fbc }. The browser's copies of _fbp/_fbc are used only when the request
 * cookies are missing - they are the same values when both exist.
 *
 * Follows Meta's parameter reference
 * (developers.facebook.com/documentation/ads-commerce/conversions-api/parameters):
 * event_source_url is required for website events, so the checkout page is
 * the fallback; num_items belongs to InitiateCheckout only; each item carries
 * its delivery_category (home_delivery - the shop delivers to the door).
 */
function buildPurchase({ req, orderName, customer, items, total, userId, tracking, lydPerUsd, prices }) {

  const { first, last } = nameParts(customer.name);
  const phoneHash = hashedPhone(customer.phone);

  const user_data = dropEmpty({
    ph: phoneHash ? [phoneHash] : undefined,
    em: customer.email ? [hashed(customer.email)] : undefined,
    fn: hashedName(first),
    ln: hashedName(last),
    ct: hashedCity(customer.city),
    country: hashed('ly'),
    // One stable ID per person across channels: the account when signed in,
    // otherwise the phone - both hashed.
    external_id: externalIds({ userId, visitorId: visitorIdOf(req), phoneHash }),
    // The visitor's address - never a proxy's, the server's, or one shared by many (lib/clientIp.js).
    client_ip_address: sharedGuard(req, visitorIdOf(req) || validFbp(cookie(req, '_fbp')) || validFbp(tracking?.fbp)),
    client_user_agent: req.headers['user-agent'],
    fbp: validFbp(cookie(req, '_fbp')) || validFbp(tracking?.fbp),
    fbc: validFbc(cookie(req, '_fbc')) || validFbc(tracking?.fbc),
  });

  const contents = items.map((i) => {
    const price = prices?.get(i.productId);
    return dropEmpty({
      id: String(i.productId),
      quantity: i.quantity,
      item_price: price !== undefined ? money(price, lydPerUsd).value : undefined,
      delivery_category: 'home_delivery',
    });
  });

  return dropEmpty({
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: `purchase-${orderName}`,
    action_source: 'website',
    event_source_url: siteUrl(tracking?.eventSourceUrl) || siteUrl(req.headers.referer) || `${SITE_URL}checkout`,
    referrer_url: tracking?.referrerUrl ? String(tracking.referrerUrl).slice(0, 500) : undefined,
    user_data,
    custom_data: dropEmpty({
      ...money(Number(total) || 0, lydPerUsd),
      content_type: 'product',
      content_ids: items.map((i) => String(i.productId)),
      contents,
      order_id: orderName,
    }),
  });
}

/**
 * The browser Pixel's other events, relayed through the server so they reach
 * Meta even when the Pixel is blocked (ad blockers, iOS limits) - Events
 * Manager's "event coverage": the share of Pixel events the Conversions API
 * also sends. Same event_name and event_id as the browser's copy, so Meta
 * keeps one (48 h window). Purchase is not here: the order route sends it.
 */
const BROWSER_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'AddToCart',
  'AddToWishlist',
  'InitiateCheckout',
  // Cash on delivery: the moment the customer has given a valid name and phone at checkout.
  'AddPaymentInfo',
  'Search',
  'Contact',
  'CompleteRegistration',
  // Custom (fbq trackCustom): a category of mattresses opened - for catalogue audiences.
  'ViewCategory',
]);

/** What a browser event's custom_data may carry - Meta's documented keys, typed and bounded. */
function cleanCustomData(eventName, params, lydPerUsd) {
  if (!params || typeof params !== 'object') return undefined;
  const ids = (list) =>
    Array.isArray(list) ? list.slice(0, 50).map((v) => String(v).slice(0, 64)).filter(Boolean) : undefined;
  const value = Number(params.value);
  const priced = Number.isFinite(value) && value >= 0 && params.currency === 'LYD' ? money(value, lydPerUsd) : {};
  const contents = Array.isArray(params.contents)
    ? params.contents.slice(0, 50).map((c) =>
        dropEmpty({
          id: c && c.id !== undefined ? String(c.id).slice(0, 64) : undefined,
          quantity: Number.isInteger(c?.quantity) && c.quantity > 0 ? c.quantity : undefined,
          delivery_category: c?.delivery_category === 'home_delivery' ? 'home_delivery' : undefined,
        })
      )
    : undefined;
  return dropEmpty({
    ...priced,
    content_ids: ids(params.content_ids),
    content_type: params.content_type === 'product' || params.content_type === 'product_group' ? params.content_type : undefined,
    content_name: typeof params.content_name === 'string' ? params.content_name.slice(0, 200) : undefined,
    content_category: typeof params.content_category === 'string' ? params.content_category.slice(0, 100) : undefined,
    contents: contents?.length ? contents : undefined,
    // The reference keeps num_items for InitiateCheckout and search_string for Search.
    num_items: eventName === 'InitiateCheckout' && Number.isInteger(params.num_items) ? params.num_items : undefined,
    search_string: eventName === 'Search' && typeof params.search_string === 'string' ? params.search_string.slice(0, 200) : undefined,
    // Our own property on Contact: a WhatsApp order from a product, or a
    // question through the support form - as the Pixel's copy says.
    contact_channel:
      eventName === 'Contact' && ['whatsapp_order', 'support_form'].includes(params.contact_channel)
        ? params.contact_channel
        : undefined,
  });
}

/**
 * Builds a relayed browser event. `person` is the signed-in customer, when
 * there is one ({ id, name, phone, city }) - hashed as for a purchase.
 */
function buildBrowserEvent({ req, eventName, eventId, sourceUrl, referrerUrl, fbp, fbc, params, person, browserUser, lydPerUsd }) {
  const { first, last } = nameParts(person?.name);
  const phoneHash = hashedPhone(person?.phone);
  const custom = cleanCustomData(eventName, params, lydPerUsd);
  // What the signed-in account says wins; the browser's hashed fields fill the rest.
  const b = browserMatch(browserUser);
  const nonEmpty = (v) => (Array.isArray(v) ? (v.length ? v : undefined) : v);
  return dropEmpty({
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: 'website',
    event_source_url: siteUrl(sourceUrl) || siteUrl(req.headers.referer) || SITE_URL,
    referrer_url: referrerUrl ? String(referrerUrl).slice(0, 500) : undefined,
    user_data: dropEmpty({
      ph: phoneHash ? [phoneHash] : nonEmpty(b.ph),
      em: nonEmpty(b.em),
      fn: (person && hashedName(first)) || b.fn,
      ln: (person && hashedName(last)) || b.ln,
      ct: (person && hashedCity(person.city)) || nonEmpty(b.ct),
      country: hashed('ly'),
      external_id: externalIds({
        userId: person?.id,
        visitorId: visitorIdOf(req),
        phoneHash: phoneHash || b.ph?.[0],
        more: b.external_id,
      }),
      client_ip_address: sharedGuard(req, visitorIdOf(req) || validFbp(cookie(req, '_fbp')) || validFbp(fbp)),
      client_user_agent: req.headers['user-agent'],
      fbp: validFbp(cookie(req, '_fbp')) || validFbp(fbp),
      fbc: validFbc(cookie(req, '_fbc')) || validFbc(fbc),
    }),
    custom_data: custom && Object.keys(custom).length ? custom : undefined,
  });
}

/*
 * Browser events are many (a PageView per page), so they go in batches: one
 * request per couple of seconds, up to Meta's 1,000 events per request - far
 * fewer calls than one per event, and nothing waits on them.
 */
const BATCH_MS = 2000;
const BATCH_MAX = 200;
let queue = [];
let queueDataset = null;
let flushTimer = null;

function flushQueue() {
  clearTimeout(flushTimer);
  flushTimer = null;
  const events = queue;
  const datasetId = queueDataset;
  queue = [];
  if (events.length && datasetId) send(datasetId, events).catch(() => {});
}

function enqueue(datasetId, event) {
  if (queueDataset && queueDataset !== datasetId) flushQueue();
  queueDataset = datasetId;
  queue.push(event);
  if (queue.length >= BATCH_MAX) flushQueue();
  else if (!flushTimer) {
    flushTimer = setTimeout(flushQueue, BATCH_MS);
    flushTimer.unref?.();
  }
}

/**
 * Sends events to the dataset. Never throws: tracking must not be able to fail
 * an order. The outcome is logged and kept for the dashboard.
 */
async function send(datasetId, events) {
  if (!isConfigured() || !datasetId) return { sent: false, reason: 'not_configured' };

  // The token travels in the body, not the URL, so it can never end up in a
  // proxy or error log that records addresses.
  const body = {
    data: events,
    access_token: token(),
    ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
  };
  const url = `${GRAPH_URL}/${GRAPH_VERSION}/${encodeURIComponent(datasetId)}/events`;
  // A purchase is named by its ID; a batch of browser events is counted by kind.
  const names =
    events.length <= 3
      ? events.map((e) => `${e.event_name}:${e.event_id}`).join(', ')
      : Object.entries(events.reduce((n, e) => ({ ...n, [e.event_name]: (n[e.event_name] || 0) + 1 }), {}))
          .map(([name, count]) => `${name}×${count}`)
          .join(', ');

  try {
    const res = await postRaw(url, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: TIMEOUT_MS,
    });
    let json = null;
    try {
      json = JSON.parse(res.text);
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      const message = json?.error?.message || res.text.slice(0, 200);
      lastResult = { ok: false, at: new Date().toISOString(), events: names, error: message };
      console.error(`[Meta CAPI] ${names} rejected (${res.status}): ${message}`);
      return { sent: false, reason: message };
    }
    lastResult = { ok: true, at: new Date().toISOString(), events: names, received: json?.events_received };
    console.log(`[Meta CAPI] ${names} sent (received: ${json?.events_received})`);
    return { sent: true };
  } catch (err) {
    lastResult = { ok: false, at: new Date().toISOString(), events: names, error: err.message };
    console.error(`[Meta CAPI] ${names} failed: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

/**
 * Meta's own way to verify a Conversions API setup: one event sent with a
 * test code from Events Manager > Test events. It appears in that tab within
 * seconds and never counts as live data. A PageView, so even a mistyped code
 * could not add a fake sale.
 *
 * (Reading the dataset with the token is not a valid check: tokens generated
 * in Events Manager may only send events, and Meta answers a read with
 * "Missing Permission" even when sending works.)
 */
async function sendTestEvent(datasetId, testEventCode, { sourceUrl, userAgent, ip }) {
  if (!isConfigured()) return { ok: false, error: 'لا يوجد مفتاح Conversions API — ضعه في لوحة الإدارة' };
  if (!datasetId) return { ok: false, error: 'لا يوجد رقم بكسل محفوظ' };
  if (!/^TEST[A-Z0-9]{2,20}$/i.test(testEventCode || '')) {
    return { ok: false, error: 'رمز الاختبار يبدأ بـ TEST — انسخه من Events Manager > Test events' };
  }
  const body = {
    data: [
      {
        event_name: 'PageView',
        event_time: Math.floor(Date.now() / 1000),
        event_id: `capi-test-${Date.now()}`,
        action_source: 'website',
        event_source_url: sourceUrl,
        user_data: dropEmpty({ client_ip_address: ip, client_user_agent: userAgent, country: hashed('ly') }),
      },
    ],
    access_token: token(),
    test_event_code: testEventCode.toUpperCase(),
  };
  try {
    const res = await postRaw(`${GRAPH_URL}/${GRAPH_VERSION}/${encodeURIComponent(datasetId)}/events`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: TIMEOUT_MS,
    });
    let json = null;
    try {
      json = JSON.parse(res.text);
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
    return { ok: true, received: json?.events_received };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  isConfigured,
  status,
  buildPurchase,
  buildBrowserEvent,
  BROWSER_EVENTS,
  enqueue,
  flushQueue,
  send,
  sendTestEvent,
  hashedPhone,
  clientIp,
};
