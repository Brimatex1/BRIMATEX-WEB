/**
 * One stable, first-party ID per browser - `brx_vid` - so Meta can tell one
 * visitor's page views, product views and cart apart from everyone else's
 * before they ever sign in or type a phone number (user_data.external_id,
 * hashed). A guest was otherwise only an IP address and a browser.
 *
 * Set by the server on the page itself: Safari keeps a cookie written by
 * script for 7 days at most, one sent in a response header far longer. Each
 * visit renews it for a year. The browser reads the same value
 * (web/src/lib/visitor.ts) for the Pixel; the Conversions API reads it here.
 * It names a browser, nothing about the person, and leaves only hashed.
 */
'use strict';

const crypto = require('crypto');

const COOKIE = 'brx_vid';
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const VALID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The request's visitor ID, or null when it has none (or a malformed one). */
function visitorIdOf(req) {
  const match = String(req?.headers?.cookie || '').match(/(?:^|;\s*)brx_vid=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]).trim().toLowerCase() : '';
  return VALID.test(value) ? value : null;
}

/** HTTPS unless the page is served from this machine (no Secure cookie over plain http). */
function isSecure(req) {
  const host = String(req?.headers?.host || '');
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return false;
  return true;
}

/**
 * The Set-Cookie header for a page: the visitor's own ID renewed for a year,
 * or a new one. Readable by the page's script (the Pixel needs it), sent only
 * to this site.
 */
function visitorCookie(req) {
  const id = visitorIdOf(req) || crypto.randomUUID();
  return `${COOKIE}=${id}; Max-Age=${YEAR_SECONDS}; Path=/; SameSite=Lax${isSecure(req) ? '; Secure' : ''}`;
}

// Meta's browser ID, as the Pixel writes it: fb.<subdomain index>.<creation ms>.<random>.
// Index 1: the site answers on brimatex.ly itself (www moves there).
const FBP = /^fb\.\d\.\d{10,13}\.\d+$/;
const FBP_SECONDS = 90 * 24 * 60 * 60;

/** The request's _fbp, or null when it has none (or a malformed one). */
function fbpOf(req) {
  const match = String(req?.headers?.cookie || '').match(/(?:^|;\s*)_fbp=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]).trim() : '';
  return FBP.test(value) ? value : null;
}

/**
 * The Set-Cookie header for Meta's _fbp. The Pixel only writes one when its
 * script runs - an ad blocker, or Safari cutting script cookies to 7 days,
 * leaves the Conversions API with no browser ID. So the page carries one:
 * the visitor's own, renewed for Meta's 90 days, or a new one in the Pixel's
 * format (what Meta's Parameter Builder does). The Pixel reuses an _fbp it
 * finds, so the browser and the server send the same value.
 */
function fbpCookie(req) {
  const value = fbpOf(req) || `fb.1.${Date.now()}.${crypto.randomInt(1e9, 2147483647)}`;
  return `_fbp=${value}; Max-Age=${FBP_SECONDS}; Path=/; SameSite=Lax${isSecure(req) ? '; Secure' : ''}`;
}

module.exports = { visitorIdOf, visitorCookie, fbpOf, fbpCookie, COOKIE };
