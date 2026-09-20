/**
 * مسارات لوحة التحكّم — تسعة عشر مساراً خلف requireAdmin.
 *
 * نُقلت كما هي من handleApi بلا تغيير منطقٍ واحد. وهي أكبر كتلة في
 * الموجّه وأقلّها مساساً بالعميل: لا يصلها إلا مدير موثّق، فعزلها يخفّف
 * ما يُقرأ عند تتبّع مسار عميل.
 *
 * requireAdmin والمساعدات الأربع تُحقن لأنّها مُعرَّفة داخل server.js،
 * واستيرادها منه يصنع دائرة. والمكتبات تُستورد مباشرةً.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const odoo = require('../lib/odoo');
const whatsapp = require('../lib/whatsapp');
const auth = require('../lib/auth');
const orders = require('../lib/orders');
const settings = require('../lib/settings');
const productOverrides = require('../lib/productOverrides');
const push = require('../lib/push');
const db = require('../lib/db');
const odooStatus = require('../lib/odooStatus');
const catalogue = require('../lib/catalogue');
const { getProducts } = catalogue;

/** مثل نظيرتها في routes/auth.js — انظر شرحها هناك. */
const NOT_HANDLED = Symbol('admin-route-not-handled');

function createAdminRoutes({ requireAdmin, sendJson, readBody, deleteUploadedFile }) {
  return async function handleAdminRoutes(req, res, url) {
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

      const before = await orders.getOrderByName(orderName);
      const updated = await orders.updateOrder(orderName, updates);
      if (!updated) return sendJson(res, 404, { error: 'الطلب غير موجود' });

      // Fire-and-forget: a push failure must not fail the status change that
      // already succeeded. notifyOrderStage never throws — see src/lib/push.js.
      void push.notifyOrderStage(before || {}, updated);

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

    // ---- تخصيص المنتج (أيقونات، وصف، تفعيل) ----

    const overridesMatch = url.pathname.match(/^\/api\/admin\/products\/(\d+)\/overrides$/);
    if (overridesMatch && (req.method === 'GET' || req.method === 'PATCH')) {
      if (!(await requireAdmin(req, res))) return;
      const productId = Number(overridesMatch[1]);

      if (req.method === 'GET') {
        const current = await productOverrides.getOverridesForProduct(productId);
        return sendJson(res, 200, { productId, ...current });
      }

      // PATCH — only the fields present in the body are changed.
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'JSON غير صالح' });
      }

      const changes = {};
      if (payload.iconKeys !== undefined) {
        if (!Array.isArray(payload.iconKeys) || !payload.iconKeys.every((k) => typeof k === 'string')) {
          return sendJson(res, 400, { error: 'قائمة الأيقونات غير صالحة' });
        }
        changes.iconKeys = payload.iconKeys;
      }
      if (payload.description !== undefined) {
        if (payload.description !== null && typeof payload.description !== 'string') {
          return sendJson(res, 400, { error: 'الوصف غير صالح' });
        }
        // An empty string clears the override, falling back to the source's own description.
        changes.description = payload.description ? payload.description.trim() || null : null;
      }
      if (payload.enabled !== undefined) {
        if (typeof payload.enabled !== 'boolean') {
          return sendJson(res, 400, { error: 'قيمة التفعيل غير صالحة' });
        }
        changes.enabled = payload.enabled;
      }

      const saved = await productOverrides.setOverridesForProduct(productId, changes);
      return sendJson(res, 200, { productId, ...saved });
    }

    // ---- صورة المنتج (رفع من اللوحة) ----

    const imageOverrideMatch = url.pathname.match(/^\/api\/admin\/products\/(\d+)\/image$/);
    if (imageOverrideMatch && (req.method === 'POST' || req.method === 'DELETE')) {
      if (!(await requireAdmin(req, res))) return;
      const productId = Number(imageOverrideMatch[1]);

      if (req.method === 'DELETE') {
        const current = await productOverrides.getOverridesForProduct(productId);
        deleteUploadedFile(current.imageUrl);
        const saved = await productOverrides.setOverridesForProduct(productId, { imageUrl: null });
        return sendJson(res, 200, { productId, ...saved });
      }

      // POST — body is a base64 data URL; ~7MB caps the decoded image around 5MB.
      let body;
      try {
        body = await readBody(req, 7_000_000);
      } catch (err) {
        return sendJson(res, 413, { error: err.message });
      }
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'JSON غير صالح' });
      }

      const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(payload.imageDataUrl || '');
      if (!match) {
        return sendJson(res, 400, { error: 'صيغة الصورة يجب أن تكون JPEG أو PNG أو WebP' });
      }
      const [, ext, base64] = match;
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length > 5_000_000) {
        return sendJson(res, 413, { error: 'حجم الصورة يتجاوز 5 ميجابايت' });
      }

      const current = await productOverrides.getOverridesForProduct(productId);
      deleteUploadedFile(current.imageUrl);

      const filename = `${productId}-${Date.now()}.${ext === 'jpg' ? 'jpeg' : ext}`;
      const uploadsDir = path.join(PUBLIC_DIR, 'uploads', 'products');
      fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);

      const imageUrl = `/uploads/products/${filename}`;
      const saved = await productOverrides.setOverridesForProduct(productId, { imageUrl });
      return sendJson(res, 200, { productId, ...saved });
    }

    // ---- إعدادات أودو ----

    if (req.method === 'GET' && url.pathname === '/api/admin/settings/odoo') {
      if (!(await requireAdmin(req, res))) return;
      // Never includes the API key — only whether one is stored.
      return sendJson(res, 200, { odoo: settings.readPublicOdoo(), lastError: odooStatus.get() });
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
      catalogue.invalidate();
      return sendJson(res, 200, { odoo: saved });
    }

    if (req.method === 'DELETE' && url.pathname === '/api/admin/settings/odoo') {
      if (!(await requireAdmin(req, res))) return;
      const cleared = settings.clearOdoo();
      catalogue.invalidate();
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

    // ---- إعدادات دعم واتساب ----

    if (req.method === 'GET' && url.pathname === '/api/admin/settings/whatsapp-support') {
      if (!(await requireAdmin(req, res))) return;
      return sendJson(res, 200, { whatsappSupport: settings.readPublicWhatsappSupport() });
    }

    if (req.method === 'PUT' && url.pathname === '/api/admin/settings/whatsapp-support') {
      if (!(await requireAdmin(req, res))) return;

      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'JSON غير صالح' });
      }

      const phone = String(payload.phone || '').trim();
      if (phone && !/^\+?[0-9]{8,15}$/.test(phone)) {
        return sendJson(res, 400, {
          error: 'رقم الهاتف يجب أن يكون بالصيغة الدولية (أرقام فقط، مع + اختياري)',
        });
      }

      const saved = settings.saveWhatsappSupport({ phone, message: payload.message });
      return sendJson(res, 200, { whatsappSupport: saved });
    }

    if (req.method === 'DELETE' && url.pathname === '/api/admin/settings/whatsapp-support') {
      if (!(await requireAdmin(req, res))) return;
      const cleared = settings.clearWhatsappSupport();
      return sendJson(res, 200, { whatsappSupport: cleared });
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

      catalogue.invalidate();
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

    return NOT_HANDLED;
  };
}

module.exports = { createAdminRoutes, NOT_HANDLED };
