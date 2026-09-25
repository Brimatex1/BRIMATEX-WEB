#!/usr/bin/env node
// Mattress e-commerce storefront with Odoo integration. Foam blocks are
// factory-only and never listed online — see src/lib/sellable.js.
// Node 18+.
//
// Run:                node server.js
// Configure Odoo:     set ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY
//                     (without them the store runs in demo mode with sample products).
// Configure Postgres: set DATABASE_URL (without it, accounts/orders use local
//                     files — see docs/POSTGRES_SETUP.md).
// Configure WhatsApp: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM

require('./lib/no-undici');
require('./lib/load-env');
const http = require('http');
const fs = require('fs');
const path = require('path');
const odoo = require('./lib/odoo');
const banners = require('./lib/banners');
const share = require('./lib/share');
const perksLib = require('./lib/perks');
const metaFeed = require('./lib/metaFeed');
const seo = require('./lib/seo');
const whatsapp = require('./lib/whatsapp');
const auth = require('./lib/auth');
const otp = require('./lib/otp');
const devices = require('./lib/devices');
const push = require('./lib/push');
const orders = require('./lib/orders');
const productOverrides = require('./lib/productOverrides');
const settings = require('./lib/settings');
const { isOfferable } = require('./lib/sellable');
const db = require('./lib/db');
const odooStatus = require('./lib/odooStatus');
const { getProducts, visibleOnly, productLookup } = require('./lib/catalogue');
const { sendJson, readBody } = require('./lib/respond');
const { createAuthRoutes, NOT_HANDLED: AUTH_NOT_HANDLED } = require('./routes/auth');
const { createAdminRoutes, NOT_HANDLED: ADMIN_NOT_HANDLED } = require('./routes/admin');
const { createOrderRoutes, NOT_HANDLED: ORDER_NOT_HANDLED } = require('./routes/orders');
const { handleUserRoutes, NOT_HANDLED: USER_NOT_HANDLED } = require('./routes/user');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
// Which commit is actually serving. scripts/deploy.sh writes deployed.json
// beside the app after it has verified the copy; a deploy that silently
// copied nothing therefore cannot claim a new version. Read once at boot:
// Passenger restarts on every deploy, so a stale value is not reachable.
// The repository is public, so the sha discloses nothing.
const DEPLOYED = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'deployed.json'), 'utf8');
    const { commit, at } = JSON.parse(raw);
    return { commit: String(commit).slice(0, 40), at: String(at) };
  } catch {
    // Running from a checkout, or deployed before this file existed.
    return null;
  }
})();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Rate limiting: max 10 orders per IP per 60 seconds
const orderAttempts = new Map();
// `|| 10` would swallow a configured 0, which is a valid setting: it stops all
// orders (maintenance mode). Fall back only when the value is not a usable number.
const RATE_LIMIT_ORDERS_PER_MIN = (() => {
  const configured = Number(process.env.RATE_LIMIT_ORDERS_PER_MIN);
  return Number.isFinite(configured) && configured >= 0 ? configured : 10;
})();

/**
 * Support tickets per IP per minute. Lower than orders: a person writing to
 * customer care sends one message, not ten, and each one lands in a human's
 * queue. Old minute buckets are pruned on every check so the map stays small.
 */
const supportAttempts = new Map();
const SUPPORT_TICKETS_PER_MIN = 5;

function checkSupportRateLimit(ip) {
  const minute = Math.floor(Date.now() / 60_000);
  for (const key of supportAttempts.keys()) {
    if (Number(key.slice(key.lastIndexOf(':') + 1)) < minute) supportAttempts.delete(key);
  }
  const key = `${ip}:${minute}`;
  const count = (supportAttempts.get(key) || 0) + 1;
  supportAttempts.set(key, count);
  return count > SUPPORT_TICKETS_PER_MIN;
}

/** What a visitor can write to customer care about — the label becomes the ticket subject prefix. */
const SUPPORT_TOPICS = {
  product: 'استفسار عن منتج',
  order: 'متابعة طلب',
  warranty: 'ضمان',
  complaint: 'شكوى',
  other: 'استفسار عام',
};

const SUPPORT_LOG = path.join(__dirname, 'data', 'support.local.jsonl');

function validateSupportTicket(body) {
  if (!body || typeof body !== 'object') return 'بيانات غير صالحة';
  const name = String(body.name ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  const email = String(body.email ?? '').trim();
  const message = String(body.message ?? '').trim();
  const orderName = String(body.orderName ?? '').trim();
  if (!name) return 'الاسم مطلوب';
  if (name.length > 100) return 'الاسم طويل جداً';
  if (!phone) return 'رقم الهاتف مطلوب';
  if (!isValidPhone(phone)) return 'رقم الهاتف غير صالح';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'البريد الإلكتروني غير صالح';
  if (!Object.prototype.hasOwnProperty.call(SUPPORT_TOPICS, body.topic)) return 'اختر موضوع الرسالة';
  if (message.length < 10) return 'اكتب رسالتك في 10 أحرف على الأقل';
  if (message.length > 2000) return 'الرسالة طويلة جداً (2000 حرف كحدّ أقصى)';
  if (orderName.length > 40) return 'رقم الطلب غير صالح';
  return null;
}

/** Removes a previously admin-uploaded product image. Silently no-ops for
 * anything that isn't one of ours (a null override, or a future non-upload
 * image source) — never deletes based on an untrusted path. */
function deleteUploadedFile(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/products/')) return;
  const filePath = path.join(PUBLIC_DIR, imageUrl);
  fs.unlink(filePath, () => {});
}

function checkRateLimit(ip) {
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const key = `${ip}:${minute}`;
  const count = (orderAttempts.get(key) || 0) + 1;
  orderAttempts.set(key, count);
  if (count > RATE_LIMIT_ORDERS_PER_MIN) return true;
  return false;
}

// Separators are allowed, but the digits are what must be there — a string of
// dashes must not pass. The client checks this too; this is the enforcing copy,
// since the API can be called directly.
const PHONE_SHAPE = /^\+?[\d\s-]{9,17}$/;
const PHONE_MIN_DIGITS = 9;
const PHONE_MAX_DIGITS = 15;

function isValidPhone(phone) {
  const trimmed = String(phone ?? '').trim();
  if (!PHONE_SHAPE.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '').length;
  return digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS;
}

// Mirrors web/src/lib/utils.ts's COMING_SOON_CATEGORIES — backs up the
// disabled buy button in case an order is posted directly against the API.
// Every Odoo-sourced product is tagged 'mattress' (see src/lib/odoo.js), so
// this only bites pillow/bedding demo products until Odoo carries them too.
const COMING_SOON_CATEGORIES = new Set(['pillow', 'bedding']);

function validateOrder(order, allProducts) {
  if (!order || typeof order !== 'object') return 'بيانات الطلب غير صالحة';
  const { customer, items } = order;
  if (!customer?.name?.trim()) return 'الاسم مطلوب';
  if (!customer?.phone?.trim()) return 'رقم الهاتف مطلوب';
  if (!isValidPhone(customer.phone)) return 'رقم الهاتف غير صالح';
  if (!customer?.city?.trim()) return 'المدينة مطلوبة';
  if (!customer?.address?.trim()) return 'العنوان مطلوب';
  if (!Array.isArray(items) || items.length === 0) return 'السلة فارغة';
  const productById = productLookup(allProducts);
  for (const item of items) {
    const product = Number.isInteger(item.productId) ? productById.get(item.productId) : null;
    if (!product || product.enabled === false) return 'منتج غير موجود';
    // Without this line an unpriced product stays orderable even after it has
    // left the public list: its id is cached in the app, and one request is
    // enough to buy it for a dinar.
    if (!isOfferable(product)) return 'هذا المنتج غير متاح للطلب';
    if (COMING_SOON_CATEGORIES.has(product.category)) return 'هذا المنتج غير متاح للطلب بعد';
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) {
      return 'كمية غير صالحة';
    }
  }
  return null;
}

/**
 * Resolves the caller for /api/admin routes.
 *
 * Returns the user only when the session is valid AND the account is an admin.
 * Anything else returns null after writing the response — every admin route
 * exposes other customers' data, so the guard fails closed.
 */
async function requireAdmin(req, res) {
  const token = req.headers.authorization?.split(' ')[1];
  const session = token ? await auth.verifySession(token) : null;
  if (!session) {
    sendJson(res, 401, { error: 'غير مصرح' });
    return null;
  }
  const user = await auth.getUser(session.userId);
  if (!user || !auth.isAdmin(user)) {
    sendJson(res, 403, { error: 'هذه الصفحة للمديرين فقط' });
    return null;
  }
  return user;
}

/* Helpers are injected once at boot, not on every request. */
const handleAuthRoutes = createAuthRoutes({ isValidPhone });
const handleOrderRoutes = createOrderRoutes({ validateOrder, checkRateLimit, requireAdmin });
const handleAdminRoutes = createAdminRoutes({ requireAdmin, deleteUploadedFile });

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/products') {
    const result = await getProducts();
    return sendJson(res, 200, { ...result, products: visibleOnly(result.products) });
  }

  // A product's reviews, from customers who bought it (src/lib/perks.js). A
  // product's sizes are separate ids, and a review is of the size bought, so
  // the reviews of every size show on the product.
  const reviewsMatch = url.pathname.match(/^\/api\/products\/(\d+)\/reviews$/);
  if (req.method === 'GET' && reviewsMatch) {
    const id = Number(reviewsMatch[1]);
    const { products } = await getProducts();
    const product = products.find((p) => p.id === id || (p.variants ?? []).some((v) => v.id === id));
    const ids = product ? [product.id, ...(product.variants ?? []).map((v) => v.id)] : [id];
    return sendJson(res, 200, await perksLib.publicReviews(ids));
  }

  // The home page's sliding banners - set from the dashboard (src/lib/banners.js).
  if (req.method === 'GET' && url.pathname === '/api/banners') {
    return sendJson(res, 200, { banners: banners.list() });
  }

  const imageMatch = url.pathname.match(/^\/api\/products\/(\d+)\/image$/);
  // A product's photo - the one uploaded from the dashboard, never Odoo's (the
  // owner turned Odoo's pictures off). The app asks here for every picture, so
  // an upload shows in it at once, with no app release; a size's id finds its
  // product's photo. No upload: 404, and the app draws the name's letter.
  if (req.method === 'GET' && imageMatch) {
    const { products } = await getProducts();
    const product = productLookup(products).get(Number(imageMatch[1]));
    if (!product?.image || !product.image.startsWith('/uploads/')) {
      res.writeHead(404, { 'Cache-Control': 'no-cache' });
      return res.end();
    }
    // Short: a photo replaced in the dashboard shows within minutes.
    // A full address: some phone image loaders mishandle a relative redirect.
    res.writeHead(302, { Location: originOf(req) + product.image, 'Cache-Control': 'public, max-age=300' });
    return res.end();
  }

  // --- Orders and invoices ---
  // In src/routes/orders.js.
  const orderResult = await handleOrderRoutes(req, res, url);
  if (orderResult !== ORDER_NOT_HANDLED) return orderResult;

  // --- User Authentication ---
  // The same ten, in src/routes/auth.js - moved verbatim, the router delegates.
  const authResult = await handleAuthRoutes(req, res, url);
  if (authResult !== AUTH_NOT_HANDLED) return authResult;

  /* --- Push devices ---
     The app registers its Expo token after an order. Anonymous orders are
     allowed, so a session is optional: the token is tied to the account when
     there is one, and to the order name otherwise — either is enough to reach
     the right phone when that order's stage changes. See src/lib/push.js. */
  if (req.method === 'POST' && url.pathname === '/api/devices') {
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }

    const token = String(payload.token || '').trim();
    if (!devices.isValidToken(token)) {
      return sendJson(res, 400, { error: 'رمز الجهاز غير صالح' });
    }

    const deviceToken = req.headers.authorization?.split(' ')[1];
    const session = deviceToken ? await auth.verifySession(deviceToken) : null;

    await devices.register({
      token,
      platform: payload.platform === 'android' ? 'android' : 'ios',
      userId: session?.userId,
      orderName: typeof payload.orderName === 'string' ? payload.orderName.trim() : null,
    });

    return sendJson(res, 200, { message: 'تم تسجيل الجهاز' });
  }
  // --- Customer profile ---
  // In src/routes/user.js.
  const userResult = await handleUserRoutes(req, res, url);
  if (userResult !== USER_NOT_HANDLED) return userResult;

  // ===================== Dashboard =====================
  // The same nineteen, in src/routes/admin.js.
  const adminResult = await handleAdminRoutes(req, res, url);
  if (adminResult !== ADMIN_NOT_HANDLED) return adminResult;

  if (req.method === 'GET' && url.pathname === '/api/pixel-config') {
    // Public — a Pixel ID isn't a secret, and every visitor's browser needs
    // it to initialize tracking, not just admins.
    const { pixelId, lydPerUsd } = settings.readPublicFacebookPixel();
    return sendJson(res, 200, { pixelId, lydPerUsd });
  }

  /**
   * Customer care — replaces the WhatsApp hand-off on the website. The ticket
   * goes straight into Odoo Helpdesk (team Customer Care), where the team
   * already works. Without Odoo configured it is kept in a local log so a
   * message is never silently dropped.
   */
  if (req.method === 'POST' && url.pathname === '/api/support/tickets') {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    if (checkSupportRateLimit(clientIp)) {
      return sendJson(res, 429, { error: 'أرسلت رسائل كثيرة. انتظر دقيقة ثم حاول مجدداً.' });
    }

    let body;
    try {
      body = JSON.parse(await readBody(req, 20_000));
    } catch {
      return sendJson(res, 400, { error: 'بيانات غير صالحة' });
    }
    const invalid = validateSupportTicket(body);
    if (invalid) return sendJson(res, 400, { error: invalid });

    const name = String(body.name).trim();
    const phone = String(body.phone).trim();
    const email = String(body.email ?? '').trim();
    const message = String(body.message).trim();
    const orderName = String(body.orderName ?? '').trim();
    const firstLine = message.split(/\r?\n/)[0];
    const subject = `${SUPPORT_TOPICS[body.topic]}: ${firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine}`;

    if (!odoo.isConfigured()) {
      const ref = `LOCAL-${Date.now().toString().slice(-6)}`;
      fs.appendFileSync(
        SUPPORT_LOG,
        JSON.stringify({ ref, name, phone, email, topic: body.topic, subject, message, orderName, receivedAt: new Date().toISOString() }) + '\n'
      );
      return sendJson(res, 201, { ref, message: 'وصلت رسالتك وسنتواصل معك قريباً' });
    }

    try {
      const ticket = await odoo.createHelpdeskTicket({ name, phone, email, subject, message, orderName });
      return sendJson(res, 201, { ref: ticket.ref, message: 'وصلت رسالتك وسنتواصل معك قريباً' });
    } catch (err) {
      console.error('[Support] ticket failed:', err.message);
      odooStatus.record(err);
      return sendJson(res, 502, { error: 'تعذّر إرسال رسالتك الآن. حاول بعد قليل.' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/whatsapp-config') {
    // Public — the number is printed on the button; every visitor needs it
    // to build the wa.me link, not just admins.
    const { phone, message } = settings.readPublicWhatsappSupport();
    return sendJson(res, 200, { phone, message });
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      odooConfigured: odoo.isConfigured(),
      // Which store is actually serving - the cron sync job
      // (scripts/cron-order-sync.sh) must match it: cron does not inherit
      // the application's environment.
      store: db.isConfigured() ? 'postgres' : 'files',
      ...(DEPLOYED ? { version: DEPLOYED.commit, deployedAt: DEPLOYED.at } : {}),
    });
  }

  sendJson(res, 404, { error: 'Not found' });
}

const SHELL_CSP =
  "default-src 'self'; script-src 'self' https://connect.facebook.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data: https://www.facebook.com; connect-src 'self' https://www.facebook.com";

function serveStatic(res, urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath === '/' ? 'index.html' : safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, {
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end();
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  } else if (fs.statSync(filePath).isDirectory()) {
    // A directory carrying its own index.html is a self-contained sub-site —
    // the mobile app preview at /app is one. Serve that instead of the store's
    // shell, which would otherwise swallow anything mounted under public/.
    const nested = path.join(filePath, 'index.html');
    filePath = fs.existsSync(nested) ? nested : path.join(PUBLIC_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
  };
  if (ext === '.html') {
    headers['Content-Security-Policy'] = SHELL_CSP;
    // The SPA shell must never be cached, or users get stale asset references.
    headers['Cache-Control'] = 'no-cache';
  } else if (path.relative(PUBLIC_DIR, filePath).replace(/\\/g, '/').startsWith('assets/')) {
    // Vite fingerprints these filenames, so they are safe to cache forever.
    // Compare against the resolved path: on Windows `safePath` uses backslashes,
    // so matching '/assets/' there never fires.
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else if (path.relative(PUBLIC_DIR, filePath).replace(/\\/g, '/').startsWith('fonts/')) {
    // Not fingerprinted, but a font file is replaced only under a new name -
    // a month spares a returning visitor 140 kB on every page.
    headers['Cache-Control'] = 'public, max-age=2592000';
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

/**
 * The site's own address, for links a crawler follows. PUBLIC_URL wins; else
 * the request's host - over https, except on this machine.
 */
function originOf(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  // www redirects to the bare host (seo.redirectFor), so links never name it.
  const host = String(req.headers.host || 'localhost').replace(/^www\./i, '');
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${local ? 'http' : 'https'}://${host}`;
}

/** The public catalogue, or none - a share preview or a feed never takes the page down. */
async function publicProducts() {
  try {
    return visibleOnly((await getProducts()).products);
  } catch {
    return [];
  }
}

/** Would this address be answered with the store's app shell (rather than a file)? */
function isShell(urlPath) {
  // The same resolution as serveStatic, so the two never disagree about a path.
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath === '/' || safePath === '\\' ? 'index.html' : safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (filePath === path.join(PUBLIC_DIR, 'index.html')) return true;
  if (!fs.existsSync(filePath)) return true;
  return fs.statSync(filePath).isDirectory() && !fs.existsSync(path.join(filePath, 'index.html'));
}

/** The app shell with this address's share tags (src/lib/share.js). */
async function serveShell(req, res, url) {
  const shell = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const products = await publicProducts();
  // A product page carries its rating for search engines - the reviews of every size.
  let reviews = null;
  const productMatch = url.pathname.match(/^\/product\/(\d+)\/?$/);
  if (productMatch) {
    const id = Number(productMatch[1]);
    const product = products.find((p) => p.id === id || (p.variants ?? []).some((v) => v.id === id));
    if (product) {
      reviews = await perksLib
        .publicReviews([product.id, ...(product.variants ?? []).map((v) => v.id)])
        .catch(() => null);
    }
  }
  let html = share.render(shell, url.pathname, url.search, {
    products,
    banners: banners.list(),
    origin: originOf(req),
    reviews,
    lydPerUsd: Number(settings.readPublicFacebookPixel().lydPerUsd) || 0,
  });
  // A real 404 for an address the app lacks or a product no longer sold -
  // still the app (it shows its home), but not indexed as a page.
  const status = seo.statusFor(url.pathname, products);
  if (status === 404) html = html.replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>');
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': SHELL_CSP,
    'Cache-Control': 'no-cache',
  });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    // One address per page: www, http, a trailing slash and /favicon.ico move for good.
    const moved = seo.redirectFor(req, url);
    if (moved) {
      res.writeHead(301, { Location: moved });
      return res.end();
    }
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else if (req.method === 'GET' && url.pathname === '/feeds/meta-catalog.csv') {
      // Meta's catalogue fetches this on a schedule - src/lib/metaFeed.js.
      const { csv } = metaFeed.buildCsv(await publicProducts(), {
        origin: originOf(req),
        lydPerUsd: Number(settings.readPublicFacebookPixel().lydPerUsd) || 0,
      });
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(csv);
    } else if (req.method === 'GET' && url.pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(seo.robots(originOf(req)));
    } else if (req.method === 'GET' && url.pathname === '/sitemap.xml') {
      // src/lib/seo.js - built from the catalogue, so a new product is listed at once.
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(seo.sitemap(await publicProducts(), originOf(req)));
    } else if (/\.[a-z0-9]{2,5}$/i.test(url.pathname) && isShell(url.pathname)) {
      // A missing file (/logo.png, /old.js) is a 404, not the home page.
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end('Not found');
    } else if ((req.method === 'GET' || req.method === 'HEAD') && isShell(url.pathname)) {
      await serveShell(req, res, url);
    } else {
      serveStatic(res, url.pathname);
    }
  } catch (err) {
    console.error(`[error] ${req.method} ${url.pathname}:`, err.message);
    const status = err.message.includes('كبير') ? 413 : 502;
    const msg = status === 413 ? 'حجم الطلب كبير جداً' : 'تعذر معالجة الطلب، حاول مرة أخرى';
    sendJson(res, status, { error: msg });
  }
});

async function start() {
  if (db.isConfigured()) {
    await db.migrate();
    console.log('[Postgres] متصل — الحسابات والطلبات تُحفظ في قاعدة البيانات');
  } else {
    console.log('[Postgres] DATABASE_URL غير مضبوط — الحسابات والطلبات تُحفظ في ملفات محلية');
  }

  server.listen(PORT, () => {
    const mode = odoo.isConfigured() ? 'Odoo متصل' : 'وضع تجريبي (بدون أودو)';
    console.log(`متجر المراتب يعمل على http://localhost:${PORT} — ${mode}`);
  });
}

start().catch((err) => {
  // On cPanel the only trace of a failed boot is Passenger's stderr.log, and
  // pg throws an AggregateError (empty .message) when every address of the
  // database host refuses the connection — which logged a bare
  // "فشل بدء التشغيل:" with no reason at all. Print the sub-errors and the
  // stack as well, so the log says what actually went wrong.
  console.error('[Startup] فشل بدء التشغيل:', err.message || err.name || err);
  for (const sub of err.errors || []) {
    console.error(`  - ${sub.code || ''} ${sub.message}`);
  }
  console.error(err.stack);
  process.exit(1);
});
