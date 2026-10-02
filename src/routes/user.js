/**
 * Customer profile - addresses, orders, wishlist, and loyalty (vouchers,
 * points, reviews).
 *
 * Five routes sharing one condition: nothing is read or written without a
 * valid session token, and ownership is derived from the session rather than
 * the request - so no customer reads another's addresses by swapping an id in
 * the path. Guarded by tests/user.check.js.
 *
 * Moved verbatim out of handleApi with no logic change.
 */
'use strict';

const auth = require('../lib/auth');
const orders = require('../lib/orders');
const perks = require('../lib/perks');
const { leadDaysFromNote } = require('../lib/preorder');
const avatar = require('../lib/avatar');
const odoo = require('../lib/odoo');
const { sendJson, readBody } = require('../lib/respond');

/** The session's user id, or null after answering 401. */
async function sessionUser(req, res) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    sendJson(res, 401, { error: 'غير مصرح' });
    return null;
  }
  const session = await auth.verifySession(token);
  if (!session) {
    sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });
    return null;
  }
  return session.userId;
}

async function jsonBody(req, res) {
  try {
    return JSON.parse((await readBody(req)) || '{}');
  } catch {
    sendJson(res, 400, { error: 'JSON غير صالح' });
    return null;
  }
}

/** What the checkout wrote on an order's note (src/lib/delivery.js), read back for the app. */
function checkoutFromNote(note) {
  const text = String(note || '');
  const method = /الاستلام: استلام من الصالة/.test(text) ? 'pickup' : /الاستلام: توصيل إلى المنزل/.test(text) ? 'home' : null;
  return {
    method,
    deliveryText: text.match(/موعد التوصيل: (.+)/)?.[1]?.trim() || null,
    paymentText: text.match(/الدفع عند الاستلام: (.+)/)?.[1]?.trim() || null,
  };
}

/** An order can be cancelled by its customer until it leaves the warehouse. */
function cancellable(o) {
  const status = o.invoiceStatus || 'draft';
  return !o.shippedAt && !o.shipmentName && status !== 'cancel' && o.paymentStatus !== 'paid';
}

/** The kinds of problem a customer can report (handoff OrderIssue). */
const ISSUE_TYPES = {
  delay: 'تأخّر التوصيل',
  damaged: 'وصلت المرتبة متضرّرة',
  wrong: 'مقاس أو منتج مختلف',
  missing: 'نقص في الطلب',
  billing: 'الدفع أو الفاتورة',
  other: 'أخرى',
};
const MAX_ISSUE_PHOTOS = 4;

/** One of the session's own orders by its name, or null after answering 404. */
async function ownOrder(res, userId, name) {
  const order = await orders.getOrderByName(name);
  if (!order || order.userId !== userId) {
    sendJson(res, 404, { error: 'الطلب غير موجود' });
    return null;
  }
  return order;
}

/** Same as its counterpart in routes/auth.js - see the explanation there. */
const NOT_HANDLED = Symbol('user-route-not-handled');

async function handleUserRoutes(req, res, url) {
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
      // The delivery slip that took it out of the warehouse, and when.
      shipmentName: o.shipmentName || null,
      shippedAt: o.shippedAt || null,
      // Made to order: the days it takes, for "ready around ..." on the tracking.
      leadDays: leadDaysFromNote(o.note),
      // The app's checkout choices, and whether the customer can still cancel.
      ...checkoutFromNote(o.note),
      cancellable: cancellable(o),
    }));

    return sendJson(res, 200, { orders: result });
  }

  // --- The customer's own order: cancel, report a problem, the invoice ---
  const orderAction = url.pathname.match(/^\/api\/user\/orders\/([^/]+)\/(cancel|issues|invoice)$/);
  if (orderAction) {
    const userId = await sessionUser(req, res);
    if (!userId) return;
    const name = decodeURIComponent(orderAction[1]);
    const order = await ownOrder(res, userId, name);
    if (!order) return;
    const action = orderAction[2];

    if (action === 'cancel' && req.method === 'POST') {
      const body = await jsonBody(req, res);
      if (!body) return;
      const reason = String(body.reason || '').trim().slice(0, 300);
      if (!reason) return sendJson(res, 400, { error: 'اختر سبب الإلغاء' });
      if (!cancellable(order)) return sendJson(res, 409, { error: 'خرج الطلب للتوصيل، ولا يمكن إلغاؤه' });
      if (order.odooOrderId && odoo.isConfigured()) {
        try {
          await odoo.cancelSaleOrder(order.odooOrderId, reason);
        } catch (err) {
          if (err.code === 'shipped') return sendJson(res, 409, { error: err.message });
          console.error('[cancel]', name, err.message);
          return sendJson(res, 502, { error: 'تعذّر إلغاء الطلب الآن. حاول بعد قليل.' });
        }
      }
      await orders.updateOrder(name, { invoiceStatus: 'cancel' });
      return sendJson(res, 200, { orderName: name, invoiceStatus: 'cancel' });
    }

    if (action === 'issues' && req.method === 'POST') {
      const body = await jsonBody(req, res);
      if (!body) return;
      const type = ISSUE_TYPES[body.type] ? body.type : null;
      if (!type) return sendJson(res, 400, { error: 'اختر نوع المشكلة' });
      const description = String(body.description || '').trim().slice(0, 2000);
      const photos = Array.isArray(body.photos) ? body.photos.slice(0, MAX_ISSUE_PHOTOS) : [];
      if (type === 'damaged' && photos.length === 0) return sendJson(res, 400, { error: 'أضف صورة للضرر' });
      if (description.length < 5 && photos.length === 0) return sendJson(res, 400, { error: 'صف المشكلة باختصار' });
      const attachments = [];
      for (const dataUrl of photos) {
        const m = String(dataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
        if (!m) return sendJson(res, 400, { error: 'صورة غير صالحة' });
        const buffer = Buffer.from(m[2], 'base64');
        if (buffer.length > avatar.MAX_BYTES) return sendJson(res, 413, { error: 'حجم الصورة يتجاوز 2 ميجابايت' });
        if (!avatar.sniff(buffer)) return sendJson(res, 400, { error: 'صورة غير صالحة' });
        attachments.push({ mimetype: m[1], base64: m[2] });
      }
      const products = Array.isArray(body.products) ? body.products.map(String).slice(0, 10) : [];
      const user = await auth.getUser(userId);
      const message = [
        `المشكلة: ${ISSUE_TYPES[type]}`,
        products.length ? `المنتج: ${products.join('، ')}` : null,
        description || null,
      ]
        .filter(Boolean)
        .join('\n');
      if (!odoo.isConfigured()) {
        console.log('[issue] demo:', name, message.replace(/\n/g, ' | '), `${attachments.length} photos`);
        return sendJson(res, 201, { ref: `DEMO-${Date.now().toString().slice(-5)}` });
      }
      try {
        const ticket = await odoo.createHelpdeskTicket({
          name: user?.name || order.customer?.name || 'زبون',
          phone: user?.phone || order.customer?.phone || '',
          subject: `بلاغ عن الطلب ${name}: ${ISSUE_TYPES[type]}`,
          message,
          orderName: name,
          source: 'الإبلاغ عن مشكلة في التطبيق',
          attachments,
        });
        return sendJson(res, 201, { ref: ticket.ref });
      } catch (err) {
        console.error('[issue]', name, err.message);
        return sendJson(res, 502, { error: 'تعذّر إرسال البلاغ الآن. حاول بعد قليل.' });
      }
    }

    if (action === 'invoice' && req.method === 'GET') {
      if (!order.odooInvoiceId || !odoo.isConfigured()) return sendJson(res, 404, { error: 'لا توجد فاتورة بعد' });
      try {
        const pdf = await odoo.invoicePdfUrl(order.odooInvoiceId);
        if (!pdf) return sendJson(res, 404, { error: 'لا توجد فاتورة بعد' });
        return sendJson(res, 200, { url: pdf });
      } catch (err) {
        console.error('[invoice pdf]', name, err.message);
        return sendJson(res, 502, { error: 'تعذّر جلب الفاتورة الآن' });
      }
    }
    return sendJson(res, 405, { error: 'غير مسموح' });
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

  /* --- Profile photo (src/lib/avatar.js) ---
     One per customer, shown by the website and the app alike. */

  if (req.method === 'POST' && url.pathname === '/api/user/avatar') {
    const userId = await sessionUser(req, res);
    if (!userId) return;
    let body;
    try {
      // Base64 adds a third: ~2.8MB of JSON carries the 2MB image limit.
      body = await readBody(req, 2_800_000);
    } catch (err) {
      return sendJson(res, 413, { error: err.message });
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'JSON غير صالح' });
    }
    const saved = avatar.save(payload.imageDataUrl);
    if (saved.error) return sendJson(res, saved.status, { error: saved.error });
    const previous = (await auth.getUser(userId))?.avatarUrl;
    await auth.updateUser(userId, { avatarUrl: saved.url });
    avatar.remove(previous);
    return sendJson(res, 200, { avatarUrl: saved.url });
  }

  if (req.method === 'DELETE' && url.pathname === '/api/user/avatar') {
    const userId = await sessionUser(req, res);
    if (!userId) return;
    const previous = (await auth.getUser(userId))?.avatarUrl;
    await auth.updateUser(userId, { avatarUrl: null });
    avatar.remove(previous);
    return sendJson(res, 200, { avatarUrl: null });
  }

  /* --- Loyalty (src/lib/perks.js) ---
     One balance per customer for the website and the app. The paths and
     shapes are the ones the app already calls (brimatex-ios/src/api.ts). */

  // Everything the loyalty screens show, in one call.
  if (req.method === 'GET' && url.pathname === '/api/user/perks') {
    const userId = await sessionUser(req, res);
    if (!userId) return;
    return sendJson(res, 200, await perks.summaryFor(userId));
  }

  if (req.method === 'GET' && url.pathname === '/api/user/vouchers') {
    const userId = await sessionUser(req, res);
    if (!userId) return;
    const { vouchers } = await perks.summaryFor(userId);
    return sendJson(res, 200, { vouchers });
  }

  if (req.method === 'GET' && url.pathname === '/api/user/points') {
    const userId = await sessionUser(req, res);
    if (!userId) return;
    const { points } = await perks.summaryFor(userId);
    return sendJson(res, 200, points);
  }

  if (req.method === 'POST' && url.pathname === '/api/user/points/redeem') {
    const userId = await sessionUser(req, res);
    if (!userId) return;
    const payload = await jsonBody(req, res);
    if (!payload) return;
    const result = await perks.redeemPoints(userId, payload.points);
    if (result.error) return sendJson(res, 400, { error: result.error });
    const { vouchers, points } = await perks.summaryFor(userId);
    return sendJson(res, 201, {
      voucher: vouchers.find((v) => v.code === result.redemption.code),
      points,
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/user/reviews') {
    const userId = await sessionUser(req, res);
    if (!userId) return;
    return sendJson(res, 200, { reviews: await perks.listReviews(userId) });
  }

  if (req.method === 'POST' && url.pathname === '/api/user/reviews') {
    const userId = await sessionUser(req, res);
    if (!userId) return;
    const payload = await jsonBody(req, res);
    if (!payload) return;
    const result = await perks.addReview(userId, payload);
    if (result.error) return sendJson(res, 400, { error: result.error });
    return sendJson(res, 201, { review: result.review });
  }

  return NOT_HANDLED;
}

module.exports = { handleUserRoutes, NOT_HANDLED };
