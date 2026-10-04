/**
 * The visitor's IP address - one answer for the whole server (Meta's events,
 * the rate limits), and a guard so Meta never gets an address that stands for
 * many people.
 *
 * Where it comes from, first usable wins: CF-Connecting-IP, the first public
 * address in X-Forwarded-For, X-Real-IP, the socket. "Usable" means a valid,
 * public address that is not this server's own: a proxy's private hop, the
 * loopback Passenger talks over, or the host's public address would each be
 * the same for every visitor.
 *
 * The guard (sharedGuard): an address seen with SHARED_VISITORS different
 * visitors within a day - an office, a proxy we did not foresee, a mobile
 * carrier's shared (CGNAT) address - is no longer sent to Meta. Meta flags
 * "client IP addresses associated with multiple users", and such an address
 * hurts matching more than it helps; the visitor's other keys (fbp,
 * external_id, phone) still match the event. Counts are kept for the admin
 * panel («الربط والتكاملات») so the effect can be checked.
 */
'use strict';

const crypto = require('crypto');
const net = require('net');
const os = require('os');

/** Private, loopback, link-local, carrier-internal and unspecified addresses. */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    return /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip);
  }
  return /^(::1?$|f[cd]|fe[89ab])/i.test(ip);
}

/** This host's own public addresses, and any listed in BRIMATEX_SERVER_IPS. */
const SERVER_IPS = new Set(
  [
    ...Object.values(os.networkInterfaces())
      .flat()
      .filter((a) => a && !a.internal)
      .map((a) => a.address),
    ...String(process.env.BRIMATEX_SERVER_IPS || '').split(','),
  ]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const usable = (ip) => net.isIP(ip) && !isPrivateIp(ip) && !SERVER_IPS.has(ip.toLowerCase());
const clean = (raw) =>
  String(raw || '')
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');

/** { ip, source } - ip undefined when no header or socket holds a usable address. */
function resolve(req) {
  const h = req?.headers || {};
  const candidates = [
    ['cf-connecting-ip', h['cf-connecting-ip']],
    ...String(h['x-forwarded-for'] || '')
      .split(',')
      .map((v) => ['x-forwarded-for', v]),
    ['x-real-ip', h['x-real-ip']],
    ['socket', req?.socket?.remoteAddress],
  ];
  for (const [source, raw] of candidates) {
    const ip = clean(raw);
    if (usable(ip)) return { ip, source };
  }
  return { ip: undefined, source: null };
}

/** The visitor's address, or undefined. */
function clientIp(req) {
  return resolve(req).ip;
}

/** A key for rate limits: the visitor's address, else whatever the socket says. */
function rateKey(req) {
  return clientIp(req) || clean(req?.socket?.remoteAddress) || 'unknown';
}

/** What the server sees for this request - the admin panel shows it for the staff member's own visit. */
function explain(req) {
  const h = req?.headers || {};
  const { ip, source } = resolve(req);
  return {
    ip: ip || null,
    source,
    headers: {
      'cf-connecting-ip': h['cf-connecting-ip'] || null,
      'x-forwarded-for': h['x-forwarded-for'] || null,
      'x-real-ip': h['x-real-ip'] || null,
      socket: req?.socket?.remoteAddress || null,
    },
  };
}

/* ───────────── The shared-address guard ───────────── */

const SHARED_VISITORS = 3;
const WINDOW_MS = 24 * 60 * 60_000;
const MAX_IPS = 20_000;

/** ip → Map(visitor key → last seen) within the window. */
const seen = new Map();
const totals = { events: 0, sent: 0, shared: 0, none: 0, sources: {} };
let since = Date.now();
let lastPrune = 0;

function prune(now) {
  if (now - lastPrune < 60_000 && seen.size < MAX_IPS) return;
  lastPrune = now;
  for (const [ip, visitors] of seen) {
    for (const [v, at] of visitors) if (now - at > WINDOW_MS) visitors.delete(v);
    if (!visitors.size) seen.delete(ip);
  }
  // Still too many: the oldest addresses go first (a Map keeps insertion order).
  for (const ip of seen.keys()) {
    if (seen.size <= MAX_IPS) break;
    seen.delete(ip);
  }
}

const shortHash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 16);

/**
 * The address to send Meta for this request, or undefined when there is none
 * or it is shared. `visitor` is whatever tells visitors apart (the visitor ID,
 * _fbp); without one the user agent stands in.
 */
function sharedGuard(req, visitor, now = Date.now()) {
  const { ip, source } = resolve(req);
  totals.events++;
  if (!ip) {
    totals.none++;
    return undefined;
  }
  totals.sources[source] = (totals.sources[source] || 0) + 1;
  prune(now);
  const key = shortHash(visitor || `ua:${req?.headers?.['user-agent'] || ''}`);
  let visitors = seen.get(ip);
  if (!visitors) seen.set(ip, (visitors = new Map()));
  visitors.set(key, now);
  if (visitors.size >= SHARED_VISITORS) {
    totals.shared++;
    return undefined;
  }
  totals.sent++;
  return ip;
}

/** For the admin panel: what was sent since this server process started. */
function health(now = Date.now()) {
  prune(now);
  let sharedIps = 0;
  let top = 0;
  for (const visitors of seen.values()) {
    if (visitors.size >= SHARED_VISITORS) sharedIps++;
    top = Math.max(top, visitors.size);
  }
  return {
    since: new Date(since).toISOString(),
    events: totals.events,
    sent: totals.sent,
    shared: totals.shared,
    none: totals.none,
    sources: { ...totals.sources },
    addresses: seen.size,
    sharedAddresses: sharedIps,
    mostVisitorsOnOne: top,
    sharedVisitors: SHARED_VISITORS,
  };
}

/** Tests only. */
function _reset() {
  seen.clear();
  Object.assign(totals, { events: 0, sent: 0, shared: 0, none: 0, sources: {} });
  since = Date.now();
  lastPrune = 0;
}

module.exports = { clientIp, rateKey, explain, sharedGuard, health, isPrivateIp, SHARED_VISITORS, _reset };
