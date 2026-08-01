#!/usr/bin/env node
// Mattress & foam e-commerce storefront with Odoo integration.
// Node 18+.
//
// Run:                node server.js
// Configure Odoo:     set ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY
//                     (without them the store runs in demo mode with sample products).
// Configure Postgres: set DATABASE_URL (without it, accounts/orders use local
//                     files — see docs/POSTGRES_SETUP.md).
// Configure WhatsApp: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM

require('./lib/load-env');
const http = require('http');
const fs = require('fs');
const path = require('path');
const odoo = require('./lib/odoo');
const whatsapp = require('./lib/whatsapp');
const auth = require('./lib/auth');
const orders = require('./lib/orders');
const settings = require('./lib/settings');
const db = require('./lib/db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEMO_PRODUCTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'demo-products.json'), 'utf8')
);

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

/** Last Odoo error, surfaced to admins so a bad connection is diagnosable. */
let lastOdooError = null;

async function getProducts() {
  if (!odoo.isConfigured()) {
    return { source: 'demo', products: DEMO_PRODUCTS };
  }
  if (productCache.data && Date.now() - productCache.at < CACHE_TTL_MS) {
    return { source: 'odoo', products: productCache.data };
  }

  try {
    const products = await odoo.fetchProducts();
    productCache = { data: products, at: Date.now() };
    lastOdooError = null;
    return { source: 'odoo', products };
  } catch (err) {
    lastOdooError = { message: err.message, at: new Date().toISOString() };
    console.error('[Odoo] fetch failed:', err.message);

    // Serve the last good Odoo data rather than taking the shop down over a
    // temporary outage or a mistyped setting. Never fall back to the demo
    // catalogue here — those are placeholder prices, and quoting them as if
    // they were real is worse than showing an error.
    if (productCache.data) {
      return { source: 'odoo', products: productCache.data, stale: true };
    }
    throw err;
  }
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

    // Orders are accepted without an account, but stamp the owner when the
    // request carries a valid session so "my orders" can find them later.
    const orderToken = req.headers.authorization?.split(' ')[1];
    const orderSession = orderToken ? await auth.verifySession(orderToken) : null;

    if (odoo.isConfigured()) {
      const odooResult = await odoo.createSaleOrder(order.customer, order.items, order.note);

      // Persisted locally too — this used to return without saving anything,
      // so "my orders" and the admin dashboard never showed Odoo-backed orders.
      await orders.createOrder({
        orderName: odooResult.name,
        invoiceName: odooResult.invoiceName,
        userId: orderSession?.userId,
        source: 'odoo',
        customer: order.customer,
        items: order.items,
        note: order.note || '',
        total: odooResult.total,
        invoiceStatus: odooResult.invoiceStatus,
        paymentStatus: 'unpaid',
        odooOrderId: odooResult.id,
        odooInvoiceId: odooResult.invoiceId,
        placedAt: new Date().toISOString(),
      });

      // Remembers which Odoo partner this account maps to, so repeat orders
      // don't need to be re-matched by phone number.
      if (orderSession && odooResult.partnerId) {
        const owner = await auth.getUser(orderSession.userId);
        if (owner && !owner.odooPartnerId) {
          await auth.updateUser(orderSession.userId, { odooPartnerId: odooResult.partnerId });
        }
      }

      return sendJson(res, 201, {
        source: 'odoo',
        orderId: odooResult.id,
        orderName: odooResult.name,
        invoiceId: odooResult.invoiceId,
        invoiceName: odooResult.invoiceName,
        invoiceDate: odooResult.invoiceDate,
        invoiceStatus: odooResult.invoiceStatus,
        total: odooResult.total,
        message: `تم إنشاء الطلب ${odooResult.name} والفاتورة ${odooResult.invoiceName}`,
      });
    }

    // Demo mode: log the order locally with invoice simulation
    const orderName = `DEMO-${Date.now().toString().slice(-6)}`;
    const invoiceName = `INV-${Date.now().toString().slice(-6)}`;
    const priceById = new Map(result.products.map((p) => [p.id, Number(p.price) || 0]));
    const total = order.items.reduce(
      (sum, i) => sum + (priceById.get(i.productId) || 0) * (i.quantity || 0),
      0
    );

    await orders.createOrder({
      orderName,
      invoiceName,
      userId: orderSession?.userId,
      source: 'demo',
      customer: order.customer,
      items: order.items,
      note: order.note || '',
      invoiceStatus: 'draft',
      paymentStatus: 'unpaid',
      // Persisted so the invoice lookup can report a real amount.
      total,
      placedAt: new Date().toISOString(),
    });

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
      const found = await orders.getOrderByInvoiceName(invoiceId);
      if (!found) return sendJson(res, 404, { error: 'الفاتورة غير موجودة' });
      return sendJson(res, 200, {
        invoiceName: found.invoiceName,
        orderName: found.orderName,
        customer: found.customer.name,
        status: found.paymentStatus === 'paid' ? 'paid' : 'unpaid',
        amount: found.total || 0,
        createdAt: found.placedAt,
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
      const found = await orders.getOrderByInvoiceName(invoiceId);
      if (!found) return sendJson(res, 404, { error: 'الفاتورة غير موجودة' });
      const paidAt = new Date().toISOString();
      await orders.updateOrder(found.orderName, { paymentStatus: 'paid', paidAt });
      return sendJson(res, 200, { invoiceId, status: 'paid', paidAt });
    }

    const result = await odoo.recordPayment(Number(invoiceId), payment.amount);

    // Keep the local record (used by "my orders" / the admin dashboard) in
    // sync with the payment Odoo just recorded.
    const found = await orders.getOrderByInvoiceName(invoiceId);
    if (found) {
      await orders.updateOrder(found.orderName, {
        paymentStatus: 'paid',
        paidAt: result.recordedAt,
      });
    }

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
    const token = await auth.createSession(user.id);
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
    const token = await auth.createSession(user.id);
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
    const session = await auth.verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح أو منتهي الصلاحية' });
    }
    const user = await auth.getUser(session.userId);
    if (!user) {
      return sendJson(res, 404, { error: 'المستخدم غير موجود' });
    }
    const [addresses, wishlist] = await Promise.all([
      auth.listAddresses(user.id),
      auth.listWishlist(user.id),
    ]);
    return sendJson(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone || null,
        // Effective role, so the UI knows whether to offer the dashboard.
        role: auth.roleOf(user),
        addresses,
        wishlist,
      },
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    // Actually invalidate the token. Clearing it in the browser alone left it
    // usable server-side for the remainder of its 30 days.
    const token = req.headers.authorization?.split(' ')[1];
    await auth.deleteSession(token);
    return sendJson(res, 200, { message: 'تم الخروج بنجاح' });
  }

  // --- User Profile ---
  if (req.method === 'POST' && url.pathname === '/api/user/addresses') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
    const session = await auth.verifySession(token);
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

    const newAddr = await auth.addAddress(session.userId, {
      address: address.trim(),
      city: city.trim(),
    });
    if (!newAddr) return sendJson(res, 404, { error: 'المستخدم غير موجود' });

    return sendJson(res, 201, { message: 'تم إضافة العنوان بنجاح', address: newAddr });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/user/addresses/')) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
    const session = await auth.verifySession(token);
    if (!session) return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });

    const addressId = url.pathname.split('/').pop();
    await auth.removeAddress(session.userId, addressId);

    return sendJson(res, 200, { message: 'تم حذف العنوان بنجاح' });
  }

  // --- Orders ---
  if (req.method === 'GET' && url.pathname === '/api/user/orders') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
    const session = await auth.verifySession(token);
    if (!session) return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });

    const entries = await orders.listOrdersForUser(session.userId);
    const result = entries.map((o) => ({
      orderName: o.orderName,
      invoiceName: o.invoiceName,
      invoiceStatus: o.invoiceStatus || 'draft',
      paymentStatus: o.paymentStatus || 'unpaid',
      total: o.total || 0,
      items: Array.isArray(o.items) ? o.items : [],
      note: o.note || '',
      city: o.customer?.city || '',
      address: o.customer?.address || '',
      placedAt: o.placedAt,
      paidAt: o.paidAt || null,
    }));

    return sendJson(res, 200, { orders: result });
  }

  // --- Wishlist ---
  if (req.method === 'POST' && url.pathname === '/api/user/wishlist') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
    const session = await auth.verifySession(token);
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

    await auth.addWishlistItem(session.userId, productId);

    return sendJson(res, 201, { message: 'تم الإضافة للمفضلة' });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/user/wishlist/')) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
    const session = await auth.verifySession(token);
    if (!session) return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });

    // The id arrives as a path string; stored ids are numbers. Compare as numbers
    // or the filter never matches and nothing is ever removed.
    const productId = Number(url.pathname.split('/').pop());
    if (!Number.isInteger(productId)) {
      return sendJson(res, 400, { error: 'معرف المنتج غير صالح' });
    }

    await auth.removeWishlistItem(session.userId, productId);

    return sendJson(res, 200, { message: 'تم الحذف من المفضلة' });
  }

  // ===================== لوحة التحكم =====================

  if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
    if (!(await requireAdmin(req, res))) return;

    const allOrders = await orders.listOrders();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const sum = (list) => list.reduce((t, o) => t + (Number(o.total) || 0), 0);
    const at = (o) => new Date(o.placedAt).getTime();

    const today = allOrders.filter((o) => at(o) >= startOfDay);
    const month = allOrders.filter((o) => at(o) >= startOfMonth);

    const byStatus = {};
    for (const o of allOrders) {
      const key = o.paymentStatus === 'paid' ? 'paid' : o.invoiceStatus || 'draft';
      byStatus[key] = (byStatus[key] || 0) + 1;
    }

    return sendJson(res, 200, {
      sales: { today: sum(today), month: sum(month), total: sum(allOrders) },
      counts: { today: today.length, month: month.length, total: allOrders.length },
      byStatus,
      customers: (await auth.listUsers()).length,
      recent: allOrders.slice(0, 8).map((o) => ({
        orderName: o.orderName,
        customer: o.customer?.name || '—',
        city: o.customer?.city || '',
        total: Number(o.total) || 0,
        paymentStatus: o.paymentStatus || 'unpaid',
        placedAt: o.placedAt,
      })),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/orders') {
    if (!(await requireAdmin(req, res))) return;

    const status = url.searchParams.get('status');
    const search = (url.searchParams.get('q') || '').trim().toLowerCase();

    const matching = await orders.listOrders({ status, search });

    return sendJson(res, 200, {
      orders: matching.slice(0, 200).map((o) => ({
        orderName: o.orderName,
        invoiceName: o.invoiceName,
        customer: o.customer || {},
        items: Array.isArray(o.items) ? o.items : [],
        note: o.note || '',
        total: Number(o.total) || 0,
        invoiceStatus: o.invoiceStatus || 'draft',
        paymentStatus: o.paymentStatus || 'unpaid',
        placedAt: o.placedAt,
        paidAt: o.paidAt || null,
        userId: o.userId || null,
      })),
      totalMatching: matching.length,
    });
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/orders/')) {
    if (!(await requireAdmin(req, res))) return;

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

    const updates = {};
    if (payload.paymentStatus) {
      updates.paymentStatus = payload.paymentStatus;
      updates.paidAt = payload.paymentStatus === 'paid' ? new Date().toISOString() : null;
    }
    if (payload.invoiceStatus) updates.invoiceStatus = payload.invoiceStatus;

    const updated = await orders.updateOrder(orderName, updates);
    if (!updated) return sendJson(res, 404, { error: 'الطلب غير موجود' });

    return sendJson(res, 200, { order: updated });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/customers') {
    if (!(await requireAdmin(req, res))) return;

    const [allOrders, users] = await Promise.all([orders.listOrders(), auth.listUsers()]);
    const customers = users.map((u) => {
      const theirs = allOrders.filter((o) => o.userId === u.id);
      return {
        ...u,
        orderCount: theirs.length,
        spent: theirs.reduce((t, o) => t + (Number(o.total) || 0), 0),
        lastOrderAt: theirs.length ? theirs[0].placedAt : null,
      };
    });

    return sendJson(res, 200, { customers });
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/users/')) {
    const actor = await requireAdmin(req, res);
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

    const target = await auth.getUser(userId);
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

    await auth.updateUser(userId, { role: payload.role });
    return sendJson(res, 200, { id: userId, role: payload.role });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/products') {
    if (!(await requireAdmin(req, res))) return;

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

  // ---- إعدادات أودو ----

  if (req.method === 'GET' && url.pathname === '/api/admin/settings/odoo') {
    if (!(await requireAdmin(req, res))) return;
    // Never includes the API key — only whether one is stored.
    return sendJson(res, 200, { odoo: settings.readPublicOdoo(), lastError: lastOdooError });
  }

  if (req.method === 'PUT' && url.pathname === '/api/admin/settings/odoo') {
    if (!(await requireAdmin(req, res))) return;

    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }

    const url_ = String(payload.url || '').trim();
    if (url_ && !/^https?:\/\//i.test(url_)) {
      return sendJson(res, 400, { error: 'العنوان يجب أن يبدأ بـ http:// أو https://' });
    }

    // Changing any connection detail invalidates the cached uid.
    const before = settings.getOdoo();
    const changed =
      url_ !== before.url ||
      String(payload.db || '').trim() !== before.db ||
      String(payload.username || '').trim() !== before.username ||
      Boolean(payload.apiKey);

    const saved = settings.saveOdoo({
      url: url_,
      db: payload.db,
      username: payload.username,
      apiKey: payload.apiKey,
      uid: changed ? null : before.uid,
    });

    // Products may now come from a different place.
    productCache = { at: 0, data: null };
    return sendJson(res, 200, { odoo: saved });
  }

  if (req.method === 'DELETE' && url.pathname === '/api/admin/settings/odoo') {
    if (!(await requireAdmin(req, res))) return;
    const cleared = settings.clearOdoo();
    productCache = { at: 0, data: null };
    return sendJson(res, 200, { odoo: cleared });
  }

  // ---- إعدادات فيسبوك بكسل ----

  if (req.method === 'GET' && url.pathname === '/api/admin/settings/facebook-pixel') {
    if (!(await requireAdmin(req, res))) return;
    return sendJson(res, 200, { facebookPixel: settings.readPublicFacebookPixel() });
  }

  if (req.method === 'PUT' && url.pathname === '/api/admin/settings/facebook-pixel') {
    if (!(await requireAdmin(req, res))) return;

    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }

    const pixelId = String(payload.pixelId || '').trim();
    if (pixelId && !/^\d{5,20}$/.test(pixelId)) {
      return sendJson(res, 400, { error: 'رقم الـ Pixel يجب أن يتكون من أرقام فقط' });
    }

    const saved = settings.saveFacebookPixel({ pixelId });
    return sendJson(res, 200, { facebookPixel: saved });
  }

  if (req.method === 'DELETE' && url.pathname === '/api/admin/settings/facebook-pixel') {
    if (!(await requireAdmin(req, res))) return;
    const cleared = settings.clearFacebookPixel();
    return sendJson(res, 200, { facebookPixel: cleared });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/settings/odoo/test') {
    if (!(await requireAdmin(req, res))) return;

    if (!odoo.isConfigured()) {
      return sendJson(res, 400, { error: 'أكمل بيانات الاتصال أولاً' });
    }
    try {
      const info = await odoo.testConnection();
      return sendJson(res, 200, { ok: true, ...info });
    } catch (err) {
      // The message comes from Odoo and is what makes a bad setting diagnosable.
      return sendJson(res, 502, { error: `فشل الاتصال: ${err.message}` });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/sync') {
    if (!(await requireAdmin(req, res))) return;

    productCache = { at: 0, data: null };
    try {
      const result = await getProducts();
      return sendJson(res, 200, {
        source: result.source,
        count: result.products.length,
        syncedAt: new Date().toISOString(),
      });
    } catch (err) {
      return sendJson(res, 502, { error: `تعذّرت المزامنة: ${err.message}` });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/pixel-config') {
    // Public — a Pixel ID isn't a secret, and every visitor's browser needs
    // it to initialize tracking, not just admins.
    const { pixelId } = settings.readPublicFacebookPixel();
    return sendJson(res, 200, { pixelId });
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
    headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' https://connect.facebook.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data: https://www.facebook.com; connect-src 'self' https://www.facebook.com";
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
  console.error('[Startup] فشل بدء التشغيل:', err.message);
  process.exit(1);
});
