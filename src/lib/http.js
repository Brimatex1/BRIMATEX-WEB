// Minimal POST helper built on node:http/https.
//
// Deliberately not `fetch`: Node's global fetch is undici, which compiles its
// HTTP parser (llhttp) to WebAssembly and instantiates it on first use. On the
// CloudLinux/LVE shared host this site runs on, that instantiation dies with
//
//   RangeError: WebAssembly.instantiate(): Out of memory:
//   Cannot allocate Wasm memory for new instance
//
// because a WASM memory needs a large virtual reservation and the account's
// address space is capped. The classic http module has no such requirement, so
// every outbound call (Odoo, Twilio) goes through here instead.

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * POSTs `body` and resolves with { status, ok, text }.
 *
 * Rejects only on transport failures (DNS, connection, timeout) — an HTTP
 * error status comes back in `status` so callers can read the response body,
 * the same way they did with fetch.
 */
function postRaw(url, { headers = {}, body = '', timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const target = new URL(url);
  const client = target.protocol === 'https:' ? https : http;
  const payload = Buffer.from(body);

  return new Promise((resolve, reject) => {
    const req = client.request(
      target,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': payload.length },
        timeout,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const status = res.statusCode || 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`انتهت مهلة الاتصال بـ ${target.host}`));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

/** POSTs JSON and parses the JSON response. Throws on a non-2xx status. */
async function postJson(url, data, headers = {}) {
  const res = await postRaw(url, {
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.text}`);
  }

  try {
    return JSON.parse(res.text);
  } catch {
    throw new Error(`رد غير صالح من ${new URL(url).host}: ${res.text.slice(0, 200)}`);
  }
}

module.exports = { postRaw, postJson };
