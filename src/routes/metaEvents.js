// POST /api/meta/events - the browser Pixel's events, relayed to Meta's
// Conversions API (src/lib/meta-capi.js).
//
// Why: Events Manager counts how many Pixel events the Conversions API also
// sends ("event coverage") and asks for 75% or more. The Pixel alone loses
// events to ad blockers and iOS limits; the server's copy, with the same
// event_id, still arrives - and Meta keeps one of the two.
//
// The browser sends the event's name, ID, page and parameters; the server adds
// what it alone can vouch for - the visitor's IP, user agent and Pixel cookies,
// and the signed-in customer's hashed details. It answers at once (204) and
// forwards in batches; a visitor never waits on Meta.

const { rateKey } = require('../lib/clientIp');
const auth = require('../lib/auth');
const metaCapi = require('../lib/meta-capi');
const settings = require('../lib/settings');
const { sendJson, readBody } = require('../lib/respond');

const NOT_HANDLED = Symbol('meta-events:not-handled');

// Crawlers and headless browsers are not visitors.
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|headless|lighthouse|preview/i;

// A visitor browsing sends a handful of events a minute; this is far above that.
const PER_MINUTE = 120;
const counts = new Map();

function overLimit(ip) {
  const minute = Math.floor(Date.now() / 60_000);
  const key = `${ip}:${minute}`;
  const n = (counts.get(key) || 0) + 1;
  counts.set(key, n);
  if (counts.size > 5000) {
    for (const k of counts.keys()) if (!k.endsWith(`:${minute}`)) counts.delete(k);
  }
  return n > PER_MINUTE;
}

/** The signed-in customer, for matching: { id, name, phone, city } - or null. */
async function personFor(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    const session = await auth.verifySession(token);
    if (!session) return null;
    const user = await auth.getUser(session.userId);
    if (!user) return null;
    const addresses = await auth.listAddresses(session.userId).catch(() => []);
    return { id: user.id, name: user.name, phone: user.phone, city: addresses?.[0]?.city || null };
  } catch {
    return null;
  }
}

// An event ID already relayed: the same event twice (a retry, a page sending it
// again) would count twice in Events Manager. Kept two days, at most 20,000.
const SEEN_MS = 48 * 60 * 60_000;
const seen = new Map();

function alreadySent(eventName, eventId) {
  const key = `${eventName}:${eventId}`;
  const now = Date.now();
  if (seen.has(key) && now - seen.get(key) < SEEN_MS) return true;
  seen.set(key, now);
  if (seen.size > 20_000) {
    for (const [k, at] of seen) {
      if (now - at >= SEEN_MS || seen.size > 15_000) seen.delete(k);
      else break;
    }
  }
  return false;
}

async function handleMetaEventRoutes(req, res, url) {
  if (url.pathname !== '/api/meta/events') return NOT_HANDLED;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });

  let body;
  try {
    body = JSON.parse(await readBody(req, 8_000));
  } catch {
    return sendJson(res, 400, { error: 'JSON غير صالح' });
  }

  const eventName = String(body?.event_name || '');
  const eventId = String(body?.event_id || '');
  if (!metaCapi.BROWSER_EVENTS.has(eventName) || !/^[\w.:-]{6,100}$/.test(eventId)) {
    return sendJson(res, 400, { error: 'حدث غير معروف' });
  }

  const ip = rateKey(req);
  const ua = String(req.headers['user-agent'] || '');
  const { pixelId, lydPerUsd } = settings.readPublicFacebookPixel();
  // Accepted and dropped: nothing for Meta, but nothing for the browser to retry either.
  if (!pixelId || !metaCapi.isConfigured() || !ua || BOT.test(ua) || overLimit(ip) || alreadySent(eventName, eventId)) {
    res.writeHead(204);
    return res.end();
  }

  const person = await personFor(req);
  const event = metaCapi.buildBrowserEvent({
    req,
    eventName,
    eventId,
    sourceUrl: body.event_source_url,
    referrerUrl: typeof body.referrer_url === 'string' ? body.referrer_url : undefined,
    fbp: typeof body.fbp === 'string' ? body.fbp.slice(0, 200) : undefined,
    fbc: typeof body.fbc === 'string' ? body.fbc.slice(0, 500) : undefined,
    params: body.custom_data,
    person,
    // The browser's Advanced Matching, hashed there; only hex digests are kept (meta-capi.js).
    browserUser: body.user_data,
    lydPerUsd,
  });
  metaCapi.enqueue(pixelId, event);
  res.writeHead(204);
  return res.end();
}

module.exports = { handleMetaEventRoutes, NOT_HANDLED, _alreadySent: alreadySent };
