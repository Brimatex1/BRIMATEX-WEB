#!/usr/bin/env node
// Mattress & foam e-commerce storefront with Odoo integration.
// Zero dependencies — Node 18+.
//
// Run:            node server.js
// Configure Odoo: set ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY
//                 (without them the store runs in demo mode with sample products).
// Configure WhatsApp: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM

const http = require('http');
const fs = require('fs');
const path = require('path');
const odoo = require('./lib/odoo');
const whatsapp = require('./lib/whatsapp');
const auth = require('./lib/auth');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEMO_PRODUCTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'demo-products.json'), 'utf8')
);
const ORDERS_LOG = path.join(__dirname, 'data', 'orders.local.jsonl');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Cache Odoo products briefly so browsing doesn't hammer the ERP.
let productCache = { data: null, at: 0 };
const CACHE_TTL_MS = 60_000;

// Rate limiting: max 10 orders per IP per 60 seconds
const orderAttempts = new Map();
// `|| 10` would swallow a configured 0, which is a valid setting: it stops all
// orders (maintenance mode). Fall back only when the value is not a usable number.
const RATE_LIMIT_ORDERS_PER_MIN = (() => {
  const configured = Number(process.env.RATE_LIMIT_ORDERS_PER_MIN);
  return Number.isFinite(configured) && configured >= 0 ? configured : 10;
})();

async function getProducts() {
  if (!odoo.isConfigured()) {
    return { source: 'demo', products: DEMO_PRODUCTS };
  }
  if (productCache.data && Date.now() - productCache.at < CACHE_TTL_MS) {
    return { source: 'odoo', products: productCache.data };
  }
  const products = await odoo.fetchProducts();
  productCache = { data: products, at: Date.now() };
  return { source: 'odoo', products };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    const onData = (chunk) => {
      data += chunk;
      if (data.length > 100_000) {
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        req.destroy();
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

function validateOrder(order, allProducts) {
  if (!order || typeof order !== 'object') return 'بيانات الطلب غير صالحة';
  const { customer, items } = order;
  if (!customer?.name?.trim()) return 'الاسم مطلوب';
  if (!customer?.phone?.trim()) return 'رقم الجوال مطلوب';
  if (!isValidPhone(customer.phone)) return 'رقم الجوال غير صالح';
  if (!customer?.city?.trim()) return 'المدينة مطلوبة';
  if (!customer?.address?.trim()) return 'العنوان مطلوب';
  if (!Array.isArray(items) || items.length === 0) return 'السلة فارغة';
  const validIds = new Set(allProducts.map((p) => p.id));
  for (const item of items) {
    if (!Number.isInteger(item.productId) || !validIds.has(item.productId)) {
      return 'منتج غير موجود';
    }
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
function requireAdmin(req, res) {
  const token = req.headers.authorization?.split(' ')[1];
  const session = token ? auth.verifySession(token) : null;
  if (!session) {
    sendJson(res, 401, { error: 'غير مصرح' });
    return null;
  }
  const user = auth.getUser(session.userId);
  if (!user || !auth.isAdmin(user)) {
    sendJson(res, 403, { error: 'هذه الصفحة للمديرين فقط' });
    return null;
  }
  return user;
}

/** Every order ever placed, newest first. */
function readOrderLog() {
  try {
    return fs
      .readFileSync(ORDERS_LOG, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeOrderLog(orders) {
  fs.writeFileSync(
    ORDERS_LOG,
    orders.length ? orders.map((o) => JSON.stringify(o)).join('\n') + '\n' : ''
  );
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/products') {
    const result = await getProducts();
    return sendJson(res, 200, result);
  }

  const imageMatch = url.pathname.match(/^\/api\/products\/(\d+)\/image$/);
  if (req.method === 'GET' && imageMatch) {
    if (!odoo.isConfigured()) {
      res.writeHead(404);
      return res.end();
    }
    const buf = await odoo.fetchProductImage(Number(imageMatch[1]));
    if (!buf) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
    return res.end(buf);
  }

  if (req.method === 'POST' && url.pathname === '/api/orders') {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    if (checkRateLimit(clientIp)) {
      return sendJson(res, 429, { error: 'تم تجاوز حد الطلبات المسموحة، حاول لاحقاً' });
    }
    const body = await readBody(req);
    let order;
    try {
      order = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }
    const result = await getProducts();
    const validationError = validateOrder(order, result.products);
    if (validationError) return sendJson(res, 400, { error: validationError });

    if (odoo.isConfigured()) {
      const result = await odoo.createSaleOrder(order.customer, order.items, order.note);
      return sendJson(res, 201, {
        source: 'odoo',
        orderId: result.id,
        orderName: result.name,
        invoiceId: result.invoiceId,
        invoiceName: result.invoiceName,
        invoiceDate: result.invoiceDate,
        invoiceStatus: result.invoiceStatus,
        total: result.total,
        message: `تم إنشاء الطلب ${result.name} والفاتورة ${result.invoiceName}`,
      });
    }

    // Demo mode: append the order to a local log file with invoice simulation
    const orderName = `DEMO-${Date.now().toString().slice(-6)}`;
    const invoiceName = `INV-${Date.now().toString().slice(-6)}`;
    const priceById = new Map(result.products.map((p) => [p.id, Number(p.price) || 0]));
    const total = order.items.reduce(
      (sum, i) => sum + (priceById.get(i.productId) || 0) * (i.quantity || 0),
      0
    );
    // Orders are accepted without an account, but stamp the owner when the
    // request carries a valid session so "my orders" can find them later.
    const orderToken = req.headers.authorization?.split(' ')[1];
    const orderSession = orderToken ? auth.verifySession(orderToken) : null;

    const record = {
      ...order,
      receivedAt: new Date().toISOString(),
      orderName,
      invoiceName,
      invoiceStatus: 'draft',
      paymentStatus: 'unpaid',
      // Persisted so the invoice lookup can report a real amount.
      total,
      ...(orderSession ? { userId: orderSession.userId } : {}),
    };
    fs.appendFileSync(ORDERS_LOG, JSON.stringify(record) + '\n');

    if (orderSession) {
      const owner = auth.getUser(orderSession.userId);
      if (owner) {
        const orders = owner.orders || [];
        orders.push({ orderName, invoiceName, total, placedAt: record.receivedAt });
        auth.updateUser(orderSession.userId, { orders });
      }
    }

    // Send invoice via WhatsApp (non-blocking, fire-and-forget)
    whatsapp.sendInvoiceViaWhatsApp(
      order.customer.phone,
      invoiceName,
      'draft',
      total,
      orderName
    ).catch(err => console.error('[WhatsApp] Failed to send demo invoice:', err.message));

    return sendJson(res, 201, {
      source: 'demo',
      orderName,
      invoiceName,
      invoiceStatus: 'draft',
      total: total,
      message: `تم إنشاء الطلب ${orderName} والفاتورة ${invoiceName}`,
    });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/invoices/')) {
    const invoiceId = url.pathname.split('/').pop();
    if (!odoo.isConfigured()) {
      const orderLog = fs.readFileSync(ORDERS_LOG, 'utf8').split('\n').filter(Boolean);
      const found = orderLog.map(l => JSON.parse(l)).find(o => o.invoiceName === invoiceId);
      if (!found) return sendJson(res, 404, { error: 'الفاتورة غير موجودة' });
      return sendJson(res, 200, {
        invoiceName: found.invoiceName,
        orderName: found.orderName,
        customer: found.customer.name,
        status: found.paymentStatus === 'paid' ? 'paid' : 'unpaid',
        amount: found.total || 0,
        createdAt: found.receivedAt,
      });
    }
    const status = await odoo.getInvoiceStatus(Number(invoiceId));
    return sendJson(res, 200, status);
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/invoices/')) {
    const invoiceId = url.pathname.split('/').pop();
    const body = await readBody(req);
    let payment;
    try {
      payment = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }

    if (!odoo.isConfigured()) {
      // Demo mode: simulate payment
      const orderLog = fs.readFileSync(ORDERS_LOG, 'utf8').split('\n').filter(Boolean);
      const lines = orderLog.map(l => JSON.parse(l));
      const idx = lines.findIndex(o => o.invoiceName === invoiceId);
      if (idx === -1) return sendJson(res, 404, { error: 'الفاتورة غير موجودة' });
      lines[idx].paymentStatus = 'paid';
      lines[idx].paidAt = new Date().toISOString();
      fs.writeFileSync(ORDERS_LOG, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
      return sendJson(res, 200, { invoiceId, status: 'paid', paidAt: new Date().toISOString() });
    }

    const result = await odoo.recordPayment(Number(invoiceId), payment.amount);
    return sendJson(res, 200, { invoiceId, status: 'paid', recordedAt: result.recordedAt });
  }

  // --- User Authentication ---
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }
    const { password, name, phone } = payload;
    if (!password?.trim() || !name?.trim() || !phone?.trim()) {
      return sendJson(res, 400, { error: 'رقم الهاتف والكلمة المرورية والاسم مطلوبة' });
    }
    // Checked on new accounts only — existing users keep whatever they signed up with.
    if (!isValidPhone(phone)) {
      return sendJson(res, 400, { error: 'رقم الهاتف غير صالح' });
    }
    if (password.length < 6) {
      return sendJson(res, 400, { error: 'الكلمة المرورية يجب أن تكون 6 أحرف على الأقل' });
    }
    const user = await auth.createUser(phone, password, name);
    if (!user) {
      return sendJson(res, 409, { error: 'هذا رقم الهاتف مسجل بالفعل' });
    }
    const token = auth.createSession(user.id);
    return sendJson(res, 201, {
      message: 'تم التسجيل بنجاح',
      token,
      user: { id: user.id, phone: user.phone, name: user.name },
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }
    const { phone, password } = payload;
    if (!phone?.trim() || !password?.trim()) {
      return sendJson(res, 400, { error: 'رقم الهاتف والكلمة المرورية مطلوبة' });
    }
    const user = await auth.authenticate(phone, password);
    if (!user) {
      return sendJson(res, 401, { error: 'رقم الهاتف أو الكلمة المرورية غير صحيحة' });
    }
    const token = auth.createSession(user.id);
    return sendJson(res, 200, {
      message: 'تم الدخول بنجاح',
      token,
      user: { id: user.id, phone: user.phone, name: user.name },
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return sendJson(res, 401, { error: 'لم يتم توفير رمز الجلسة' });
    }
    const session = auth.verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح أو منتهي الصلاحية' });
    }
    const user = auth.getUser(session.userId);
    if (!user) {
      return sendJson(res, 404, { error: 'المستخدم غير موجود' });
    }
    return sendJson(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone || null,
        addresses: user.addresses || [],
        wishlist: user.wishlist || [],
        orders: user.orders || [],
      },
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    // Actually invalidate the token. Clearing it in the browser alone left it
    // usable server-side for the remainder of its 30 days.
    const token = req.headers.authorization?.split(' ')[1];
    auth.deleteSession(token);
    return sendJson(res, 200, { message: 'تم الخروج بنجاح' });
  }

  // --- User Profile ---
  if (req.method === 'POST' && url.pathname === '/api/user/addresses') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
    const session = auth.verifySession(token);
    if (!session) return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });

    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }
    const { address, city } = payload;
    if (!address?.trim() || !city?.trim()) {
      return sendJson(res, 400, { error: 'العنوان والمدينة مطلوبة' });
    }

    const user = auth.getUser(session.userId);
    if (!user) return sendJson(res, 404, { error: 'المستخدم غير موجود' });

    const newAddr = {
      id: Math.random().toString(36).slice(2),
      address: address.trim(),
      city: city.trim(),
      createdAt: new Date().toISOString(),
    };
    user.addresses = user.addresses || [];
    user.addresses.push(newAddr);
    auth.updateUser(session.userId, { addresses: user.addresses });

    return sendJson(res, 201, { message: 'تم إضافة العنوان بنجاح', address: newAddr });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/user/addresses/')) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
    const session = auth.verifySession(token);
    if (!session) return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });

    const addressId = url.pathname.split('/').pop();
    const user = auth.getUser(session.userId);
    if (!user) return sendJson(res, 404, { error: 'المستخدم غير موجود' });

    user.addresses = (user.addresses || []).filter(a => a.id !== addressId);
    auth.updateUser(session.userId, { addresses: user.addresses });

    return sendJson(res, 200, { message: 'تم حذف العنوان بنجاح' });
  }

  // --- Orders ---
  if (req.method === 'GET' && url.pathname === '/api/user/orders') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
    const session = auth.verifySession(token);
    if (!session) return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });

    // Read from the log rather than user.orders: payment status is updated
    // on the log record, so it is the accurate source.
    let entries = [];
    try {
      entries = fs.readFileSync(ORDERS_LOG, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((o) => o && o.userId === session.userId);
    } catch {
      entries = [];
    }

    const orders = entries
      .map((o) => ({
        orderName: o.orderName,
        invoiceName: o.invoiceName,
        invoiceStatus: o.invoiceStatus || 'draft',
        paymentStatus: o.paymentStatus || 'unpaid',
        total: o.total || 0,
        items: Array.isArray(o.items) ? o.items : [],
        note: o.note || '',
        city: o.customer?.city || '',
        address: o.customer?.address || '',
        placedAt: o.receivedAt,
        paidAt: o.paidAt || null,
      }))
      .sort((a, b) => String(b.placedAt).localeCompare(String(a.placedAt)));

    return sendJson(res, 200, { orders });
  }

  // --- Wishlist ---
  if (req.method === 'POST' && url.pathname === '/api/user/wishlist') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
    const session = auth.verifySession(token);
    if (!session) return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });

    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }
    // Always store the id as a number so the DELETE lookup can match it.
    const productId = Number(payload.productId);
    if (!Number.isInteger(productId)) {
      return sendJson(res, 400, { error: 'معرف المنتج مطلوب' });
    }

    const user = auth.getUser(session.userId);
    if (!user) return sendJson(res, 404, { error: 'المستخدم غير موجود' });

    user.wishlist = user.wishlist || [];
    if (!user.wishlist.find(w => Number(w.productId) === productId)) {
      user.wishlist.push({
        productId,
        addedAt: new Date().toISOString(),
      });
    }
    auth.updateUser(session.userId, { wishlist: user.wishlist });

    return sendJson(res, 201, { message: 'تم الإضافة للمفضلة' });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/user/wishlist/')) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
    const session = auth.verifySession(token);
    if (!session) return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });

    // The id arrives as a path string; stored ids are numbers. Compare as numbers
    // or the filter never matches and nothing is ever removed.
    const productId = Number(url.pathname.split('/').pop());
    if (!Number.isInteger(productId)) {
      return sendJson(res, 400, { error: 'معرف المنتج غير صالح' });
    }
    const user = auth.getUser(session.userId);
    if (!user) return sendJson(res, 404, { error: 'المستخدم غير موجود' });

    user.wishlist = (user.wishlist || []).filter(w => Number(w.productId) !== productId);
    auth.updateUser(session.userId, { wishlist: user.wishlist });

    return sendJson(res, 200, { message: 'تم الحذف من المفضلة' });
  }

  // ===================== لوحة التحكم =====================

  if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
    if (!requireAdmin(req, res)) return;

    const orders = readOrderLog();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const sum = (list) => list.reduce((t, o) => t + (Number(o.total) || 0), 0);
    const at = (o) => new Date(o.receivedAt).getTime();

    const today = orders.filter((o) => at(o) >= startOfDay);
    const month = orders.filter((o) => at(o) >= startOfMonth);

    const byStatus = {};
    for (const o of orders) {
      const key = o.paymentStatus === 'paid' ? 'paid' : o.invoiceStatus || 'draft';
      byStatus[key] = (byStatus[key] || 0) + 1;
    }

    return sendJson(res, 200, {
      sales: { today: sum(today), month: sum(month), total: sum(orders) },
      counts: { today: today.length, month: month.length, total: orders.length },
      byStatus,
      customers: auth.listUsers().length,
      recent: orders
        .slice(-8)
        .reverse()
        .map((o) => ({
          orderName: o.orderName,
          customer: o.customer?.name || '—',
          city: o.customer?.city || '',
          total: Number(o.total) || 0,
          paymentStatus: o.paymentStatus || 'unpaid',
          placedAt: o.receivedAt,
        })),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/orders') {
    if (!requireAdmin(req, res)) return;

    const status = url.searchParams.get('status');
    const search = (url.searchParams.get('q') || '').trim().toLowerCase();

    let orders = readOrderLog().reverse();
    if (status && status !== 'all') {
      orders = orders.filter((o) =>
        status === 'paid' ? o.paymentStatus === 'paid' : o.paymentStatus !== 'paid'
      );
    }
    if (search) {
      orders = orders.filter((o) =>
        [o.orderName, o.invoiceName, o.customer?.name, o.customer?.phone, o.customer?.city]
          .some((v) => String(v || '').toLowerCase().includes(search))
      );
    }

    return sendJson(res, 200, {
      orders: orders.slice(0, 200).map((o) => ({
        orderName: o.orderName,
        invoiceName: o.invoiceName,
        customer: o.customer || {},
        items: Array.isArray(o.items) ? o.items : [],
        note: o.note || '',
        total: Number(o.total) || 0,
        invoiceStatus: o.invoiceStatus || 'draft',
        paymentStatus: o.paymentStatus || 'unpaid',
        placedAt: o.receivedAt,
        paidAt: o.paidAt || null,
        userId: o.userId || null,
      })),
      totalMatching: orders.length,
    });
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/orders/')) {
    if (!requireAdmin(req, res)) return;

    const orderName = decodeURIComponent(url.pathname.split('/').pop());
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }

    const ALLOWED_PAYMENT = ['unpaid', 'paid'];
    const ALLOWED_INVOICE = ['draft', 'confirmed', 'delivered', 'cancelled'];
    if (payload.paymentStatus && !ALLOWED_PAYMENT.includes(payload.paymentStatus)) {
      return sendJson(res, 400, { error: 'حالة دفع غير معروفة' });
    }
    if (payload.invoiceStatus && !ALLOWED_INVOICE.includes(payload.invoiceStatus)) {
      return sendJson(res, 400, { error: 'حالة طلب غير معروفة' });
    }

    const orders = readOrderLog();
    const idx = orders.findIndex((o) => o.orderName === orderName);
    if (idx === -1) return sendJson(res, 404, { error: 'الطلب غير موجود' });

    if (payload.paymentStatus) {
      orders[idx].paymentStatus = payload.paymentStatus;
      orders[idx].paidAt =
        payload.paymentStatus === 'paid' ? new Date().toISOString() : null;
    }
    if (payload.invoiceStatus) orders[idx].invoiceStatus = payload.invoiceStatus;
    orders[idx].updatedAt = new Date().toISOString();

    writeOrderLog(orders);
    return sendJson(res, 200, { order: orders[idx] });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/customers') {
    if (!requireAdmin(req, res)) return;

    const orders = readOrderLog();
    const customers = auth.listUsers().map((u) => {
      const theirs = orders.filter((o) => o.userId === u.id);
      return {
        ...u,
        orderCount: theirs.length,
        spent: theirs.reduce((t, o) => t + (Number(o.total) || 0), 0),
        lastOrderAt: theirs.length ? theirs[theirs.length - 1].receivedAt : null,
      };
    });

    return sendJson(res, 200, { customers });
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/users/')) {
    const actor = requireAdmin(req, res);
    if (!actor) return;

    const userId = url.pathname.split('/').pop();
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }
    if (!['admin', 'customer'].includes(payload.role)) {
      return sendJson(res, 400, { error: 'دور غير معروف' });
    }

    const target = auth.getUser(userId);
    if (!target) return sendJson(res, 404, { error: 'المستخدم غير موجود' });

    // An env-granted admin cannot be demoted here — the change would not stick.
    if (auth.isBootstrapAdmin(target.phone)) {
      return sendJson(res, 409, {
        error: 'هذا الحساب مدير عبر إعدادات الخادم — يُعدَّل من ADMIN_PHONES',
      });
    }
    // Guard against an admin removing their own access and locking everyone out.
    if (target.id === actor.id && payload.role !== 'admin') {
      return sendJson(res, 409, { error: 'لا يمكنك إزالة صلاحيتك عن نفسك' });
    }

    auth.updateUser(userId, { role: payload.role });
    return sendJson(res, 200, { id: userId, role: payload.role });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/products') {
    if (!requireAdmin(req, res)) return;

    const result = await getProducts();
    return sendJson(res, 200, {
      source: result.source,
      /** Odoo owns the catalogue when configured; the file is editable otherwise. */
      editable: result.source !== 'odoo',
      /** Real quantities only exist in Odoo — demo mode has a boolean. */
      hasStockData: result.source === 'odoo',
      products: result.products,
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, odooConfigured: odoo.isConfigured() });
  }

  sendJson(res, 404, { error: 'Not found' });
}

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
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
  };
  if (ext === '.html') {
    headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'";
    // The SPA shell must never be cached, or users get stale asset references.
    headers['Cache-Control'] = 'no-cache';
  } else if (path.relative(PUBLIC_DIR, filePath).replace(/\\/g, '/').startsWith('assets/')) {
    // Vite fingerprints these filenames, so they are safe to cache forever.
    // Compare against the resolved path: on Windows `safePath` uses backslashes,
    // so matching '/assets/' there never fires.
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
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

server.listen(PORT, () => {
  const mode = odoo.isConfigured() ? 'Odoo متصل' : 'وضع تجريبي (بدون أودو)';
  console.log(`متجر المراتب يعمل على http://localhost:${PORT} — ${mode}`);
});
