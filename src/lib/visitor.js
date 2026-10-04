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

// Meta's cookies (_fbp, _fbc) are kept by Meta's Parameter Builder
// (capi-param-builder-nodejs) - see metaCookies.
const { ParamBuilder } = require('capi-param-builder-nodejs');
const META_SECONDS = 90 * 24 * 60 * 60;

/**
 * The Set-Cookie headers for Meta's _fbp and _fbc, as Meta asks
 * (developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/fbp-and-fbc):
 * set by the server for 90 days, so Safari - which cuts cookies written by
 * script to 7 days - and an ad blocker still leave the Conversions API the
 * browser's ID and the ad's click ID.
 *
 * Meta's Parameter Builder decides the values: the visitor's own _fbp (a new
 * one when missing or malformed), and _fbc from the ad's fbclid in the
 * address - a new click replaces an older one, the fbclid kept exactly as it
 * came. Both carry the library's appendix, and both are renewed each visit.
 * On brimatex.ly the domain is the Pixel's own (brimatex.ly), so there is one
 * cookie of each, not the Pixel's and ours side by side.
 */
function metaCookies(req, url) {
  const host = String(req?.headers?.host || '').replace(/:\d+$/, '');
  const cookies = {};
  for (const part of String(req?.headers?.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    try {
      cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* a malformed cookie is skipped */
    }
  }
  const query = {};
  for (const [k, v] of url?.searchParams ?? []) query[k] = v;
  const builder = new ParamBuilder(['brimatex.ly']);
  try {
    builder.processRequest(host || 'brimatex.ly', query, cookies, req?.headers?.referer || null, null, null);
  } catch {
    return [];
  }
  const domain = /(^|\.)brimatex\.ly$/.test(host) ? '; Domain=brimatex.ly' : '';
  const set = (name, value) => `${name}=${value}; Max-Age=${META_SECONDS}; Path=/${domain}; SameSite=Lax${isSecure(req) ? '; Secure' : ''}`;
  const out = [];
  // This server used to write _fbp without a domain: that copy goes, or the
  // browser would carry two _fbp - ours and the Pixel's.
  if (domain) out.push(`_fbp=; Max-Age=0; Path=/; SameSite=Lax${isSecure(req) ? '; Secure' : ''}`);
  if (builder.getFbp()) out.push(set('_fbp', builder.getFbp()));
  if (builder.getFbc()) out.push(set('_fbc', builder.getFbc()));
  return out;
}

module.exports = { visitorIdOf, visitorCookie, metaCookies, COOKIE };
