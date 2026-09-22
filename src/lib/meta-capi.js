/**
 * Meta Conversions API - the server-side twin of the browser Pixel.
 *
 * The Pixel runs on the customer's phone, and a good share of its events never
 * arrive: iOS tracking limits, ad blockers, a tab closed right after ordering.
 * This module sends the one event that matters most - Purchase - from the
 * server, where nothing can block it.
 *
 * Two channels, reported apart so each ad type is measured on its own sales:
 *   website  action_source 'website', paired with the browser Pixel's copy
 *   app      action_source 'app', with the device details Meta requires
 *            (app_data.extinfo). The dataset must be connected to the app in
 *            Events Manager, or Meta rejects these - the dashboard shows it.
 *
 * Deduplication: the browser sends the same Purchase with the same event ID
 * (`purchase-<order name>`), so Meta counts one purchase, not two (48 h window;
 * Meta keeps the first copy it receives).
 *
 * Configuration (the token is a secret - it lives only in the server's .env):
 *
 *   FACEBOOK_CAPI_TOKEN        Events Manager > dataset > Settings >
 *                              Conversions API > Generate access token
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

/** Latest Graph API version as of July 2026. */
const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v26.0';
const GRAPH_URL = process.env.FACEBOOK_GRAPH_URL || 'https://graph.facebook.com';
const TOKEN = process.env.FACEBOOK_CAPI_TOKEN || '';
const TEST_EVENT_CODE = process.env.FACEBOOK_TEST_EVENT_CODE || '';
const TIMEOUT_MS = 8000;

/** Last send outcome, shown in the dashboard - the only place a failure is visible. */
let lastResult = null;

function isConfigured() {
  return Boolean(TOKEN);
}

function status() {
  return { configured: isConfigured(), testMode: Boolean(TEST_EVENT_CODE), lastResult };
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

/** City: lowercase, no punctuation, no spaces. */
function hashedCity(value) {
  return hashed(String(value || '').replace(/[\p{P}\p{S}\s]/gu, ''));
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

/** The customer's real IP: the first hop of X-Forwarded-For behind the proxy. */
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
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

const str = (v, max = 100) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? String(Math.round(Number(v) * 100) / 100) : '');

/**
 * app_data for an app event, from what the app sends with its order.
 * Returns null when the one required device field (OS version) is missing -
 * Meta rejects the event without it, so it is better not sent at all.
 *
 * advertiser_tracking_enabled: on iOS this is the App Tracking Transparency
 * answer, and the app does not ask it - so iOS always reports 0, and Meta
 * measures those sales in aggregate only. Android has no such prompt: 1.
 */
function appData(app) {
  if (!app || typeof app !== 'object') return null;
  const ios = app.platform === 'ios';
  const osVersion = str(app.osVersion, 20);
  if (!osVersion || (app.platform !== 'ios' && app.platform !== 'android')) return null;
  const tracking = ios ? (app.att === 1 ? 1 : 0) : 1;
  return {
    advertiser_tracking_enabled: tracking,
    application_tracking_enabled: tracking,
    extinfo: [
      ios ? 'i2' : 'a2',
      str(app.packageName),
      str(app.appVersion, 20),
      str(app.buildVersion, 20),
      osVersion,
      str(app.deviceModel, 50),
      str(app.locale, 20).replace('-', '_'),
      str(app.timezoneAbbr, 10),
      '', // carrier - not available to the app
      num(app.screenWidth),
      num(app.screenHeight),
      num(app.screenDensity),
      '', // CPU cores
      '', // external storage
      '', // free space
      str(app.timezone, 50),
    ],
  };
}

/**
 * Builds the Purchase event. Exported separately so tests can check the payload
 * without a network call.
 *
 * channel 'web': `tracking` comes from the website's checkout -
 *   { eventSourceUrl, fbp, fbc }. The browser's copies of _fbp/_fbc are used
 *   only when the request cookies are missing - the same values when both exist.
 * channel 'app': `app` carries the device details for app_data.
 *
 * Returns null when the event cannot be built validly (an app order without
 * device details).
 */
function buildPurchase({ req, channel = 'web', orderName, customer, items, total, userId, tracking, app, lydPerUsd, prices }) {
  const isApp = channel === 'app';
  const app_data = isApp ? appData(app) : undefined;
  if (isApp && !app_data) return null;

  const [first, ...rest] = String(customer.name || '').trim().split(/\s+/);
  const last = rest.length ? rest[rest.length - 1] : '';
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
    external_id: userId ? [hashed(`user:${userId}`)] : phoneHash ? [phoneHash] : undefined,
    client_ip_address: clientIp(req),
    client_user_agent: req.headers['user-agent'],
    // Browser IDs exist only on the website.
    fbp: isApp ? undefined : cookie(req, '_fbp') || tracking?.fbp,
    fbc: isApp ? undefined : cookie(req, '_fbc') || tracking?.fbc,
  });

  const contents = items.map((i) => {
    const price = prices?.get(i.productId);
    return dropEmpty({
      id: String(i.productId),
      quantity: i.quantity,
      item_price: price !== undefined ? money(price, lydPerUsd).value : undefined,
    });
  });

  return dropEmpty({
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: `purchase-${orderName}`,
    action_source: isApp ? 'app' : 'website',
    event_source_url: isApp ? undefined : tracking?.eventSourceUrl,
    app_data,
    user_data,
    custom_data: dropEmpty({
      ...money(Number(total) || 0, lydPerUsd),
      content_type: 'product',
      content_ids: items.map((i) => String(i.productId)),
      contents,
      num_items: items.reduce((n, i) => n + (Number(i.quantity) || 0), 0),
      order_id: orderName,
    }),
  });
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
    access_token: TOKEN,
    ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
  };
  const url = `${GRAPH_URL}/${GRAPH_VERSION}/${encodeURIComponent(datasetId)}/events`;
  const names = events.map((e) => `${e.event_name}:${e.event_id}`).join(', ');

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

module.exports = { isConfigured, status, buildPurchase, send, hashedPhone };
