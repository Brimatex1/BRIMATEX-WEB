/**
 * Headers every reply carries, whichever route answers - set once at the top
 * of the server's handler (src/server.js), so a page, a file, the feed and an
 * API reply all have them.
 *
 * - Strict-Transport-Security: browsers that once reached the site over HTTPS
 *   never try plain HTTP again (the server already moves http to https; this
 *   closes the first, unprotected request). A year, the site only - not its
 *   subdomains, which the host may serve differently.
 * - Referrer-Policy: other sites learn only that a visitor came from
 *   brimatex.ly, never the page (an order's or an account's address).
 * - Permissions-Policy: the camera, microphone, location and payment APIs are
 *   off - the site uses none of them, so nothing injected could either.
 * - X-Content-Type-Options: files are taken for what the server says they are.
 */
'use strict';

const PERMISSIONS = ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()', 'browsing-topics=()'].join(', ');
const HSTS = 'max-age=31536000';

/** A local address the server answers over plain HTTP (development, tests). */
function isLocalHost(host) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(host || ''));
}

/** Reached over HTTPS: the proxy says so, or the address is not a local one (the live site is HTTPS only). */
function isHttps(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto) return proto === 'https';
  return !isLocalHost(req.headers.host);
}

function applySecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', PERMISSIONS);
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', HSTS);
}

module.exports = { applySecurityHeaders, isHttps, PERMISSIONS, HSTS };
