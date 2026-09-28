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

module.exports = { visitorIdOf, visitorCookie, COOKIE };
