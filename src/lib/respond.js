/**
 * Shared HTTP helpers — replying, and reading a request body.
 *
 * These lived in src/server.js and were injected into every route module.
 * They are pure functions with no state and no dependency on anything in the
 * server, so the injection was a tax on where they happened to sit, not a
 * design requirement. They are a module now, required directly.
 *
 * The security headers in sendJson belong on every JSON reply, not some of
 * them, and keeping them in one place is what guarantees that.
 */
'use strict';

const { sendBody } = require('./compress');

function sendJson(res, status, payload) {
  // Compressed when the browser takes it (src/lib/compress.js) - the catalogue is tens of kB.
  sendBody(res.req, res, status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }, JSON.stringify(payload));
}

/**
 * Reads a request body up to `maxBytes`. Past the limit nothing more is kept -
 * the rest is drained and discarded, so memory stays bounded - and the promise
 * rejects, letting the route answer 413. Destroying the socket instead meant
 * the 413 never reached the client, which saw a dropped connection.
 */
function readBody(req, maxBytes = 100_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    const onData = (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        data = '';
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.resume();
        reject(new Error('حجم الطلب كبير جداً'));
      }
    };
    const onEnd = () => resolve(data);
    const onError = reject;
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

module.exports = { sendJson, readBody };
