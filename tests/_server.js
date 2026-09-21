// Test server launcher - one for every test.
//
// Born out of two real failures:
//
// 1. Inherited environment. Each test passed process.env straight through, so
//    the spawned server read .env and with it DATABASE_URL, pointing at the
//    Postgres on the host - which exists on no development machine, so it died
//    in migrate. stderr was swallowed, and the failure surfaced as a bare
//    ECONNREFUSED with no cause.
//
// 2. The orphaned server. server.kill() on Windows does not always kill, so a
//    server from an earlier run kept listening on the port. The next test
//    failed to bind, silently - and talked to that stranger instead. That is
//    how smoke.test.js passed for months while testing old code rather than
//    what is in the repository.
//
// Hence two guards here: a hermetic environment, and a flat refusal to start
// when the port is busy. An explicit failure is kinder than a false pass.

'use strict';

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Is anyone listening on this port right now? */
function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (busy) => {
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(700);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function ping(port) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/api/health', method: 'GET' },
      (res) => {
        res.resume();
        res.on('end', resolve);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Starts a hermetic server on `port` and returns it with a handle on its output.
 *
 * The default environment empties everything that ties the server to the outside
 * world: the database, Odoo, and the WhatsApp token. So the store is file-backed,
 * the catalogue is the demo one, and the verification code is printed to the log
 * instead of being sent - every flow completes at no cost and with no external
 * trace.
 *
 * `env` adds to or overrides that. `out` carries the accumulated `text` for the
 * test to read.
 */
async function startTestServer({ port, env = {} } = {}) {
  if (await portBusy(port)) {
    console.error(
      '\x1b[31mالمنفذ ' + port + ' مشغول — خادمٌ من تشغيل سابق لم يُغلق.\x1b[0m'
    );
    console.error('أغلقه ثم أعد المحاولة. الاختبار لا يتحدّث إلى خادم لم يُقلعه بنفسه.');
    process.exit(1);
  }

  const out = { text: '' };
  const server = spawn('node', [path.join(ROOT, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: '',
      ODOO_URL: '',
      ODOO_DB: '',
      ODOO_USERNAME: '',
      ODOO_API_KEY: '',
      WHATSAPP_TOKEN: '',
      // Never report test orders to the real Meta dataset.
      FACEBOOK_CAPI_TOKEN: '',
      FACEBOOK_PIXEL_ID: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => (out.text += d));
  server.stderr.on('data', (d) => (out.text += d));

  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) break;
    try {
      await ping(port);
      return { server, out };
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  server.kill();
  console.error('\x1b[31mالخادم لم يُقلع على المنفذ ' + port + '\x1b[0m');
  console.error(out.text.trim() || '(لا خرج من الخادم)');
  process.exit(1);
}

module.exports = { startTestServer };
