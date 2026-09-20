/**
 * ملف العميل — عناوينه وطلباته ومفضّلته.
 *
 * خمسة مسارات يجمعها شرط واحد: لا يُقرأ ولا يُكتب شيء إلا برمز جلسة
 * صالح، وملكُ البيانات يُستنبط من الجلسة لا من الطلب — فلا يقرأ عميلٌ عناوين
 * عميلٍ آخر بتبديل معرّف في المسار. يحميه tests/user.check.js.
 *
 * نُقلت كما هي من handleApi بلا تغيير منطقٍ واحد.
 */
'use strict';

const auth = require('../lib/auth');
const orders = require('../lib/orders');

/** مثل نظيرتها في routes/auth.js — انظر شرحها هناك. */
const NOT_HANDLED = Symbol('user-route-not-handled');

function createUserRoutes({ sendJson, readBody }) {
  return async function handleUserRoutes(req, res, url) {
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

    return NOT_HANDLED;
  };
}

module.exports = { createUserRoutes, NOT_HANDLED };
