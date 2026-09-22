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
