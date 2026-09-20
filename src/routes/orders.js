/**
 * الطلبات والفواتير — قلب المتجر.
 *
 * POST /api/orders هو المسار الوحيد الذي يُنشئ مالاً، ومعه تفرّد
 * الطلبات (requestId) التي تحمي من طلبين على محاولة دفع واحدة حين
 * تنقطع الشبكة قبل أن يصل الردّ إلى الهاتف — يحميه tests/idempotency.check.js.
 *
 * والفواتير معها لأنّها سجلّ دفع الطلب لا مجال مستقلّ.
 *
 * نُقلت كما هي من handleApi بلا تغيير منطقٍ واحد.
 */
'use strict';

const odoo = require('../lib/odoo');
const auth = require('../lib/auth');
const orders = require('../lib/orders');
const push = require('../lib/push');
const whatsapp = require('../lib/whatsapp');
const { getProducts, productLookup } = require('../lib/catalogue');
const { sendJson, readBody } = require('../lib/respond');

/** مثل نظيرتها في routes/auth.js — انظر شرحها هناك. */
const NOT_HANDLED = Symbol('order-route-not-handled');

function createOrderRoutes({ validateOrder, checkRateLimit, requireAdmin }) {
  return async function handleOrderRoutes(req, res, url) {
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

      // Idempotency. The network in Libya drops between us accepting an order
      // and the reply reaching the phone; the app then shows "try again" and the
      // customer ends up with two mattresses on one delivery. The app sends one
      // requestId per checkout attempt and repeats it on every retry, so a
      // second arrival replays the first order instead of placing another. This
      // sits above the Odoo call on purpose — creating the sale order there is
      // the side effect we must not repeat.
      const requestId =
        typeof order.requestId === 'string' && order.requestId.trim()
          ? order.requestId.trim().slice(0, 100)
          : null;
      if (requestId) {
        const alreadyPlaced = await orders.getOrderByRequestId(requestId);
        if (alreadyPlaced) {
          return sendJson(res, 200, {
            replayed: true,
            source: alreadyPlaced.source,
            orderName: alreadyPlaced.orderName,
            invoiceName: alreadyPlaced.invoiceName,
            invoiceStatus: alreadyPlaced.invoiceStatus,
            total: alreadyPlaced.total,
            message: `طلبك ${alreadyPlaced.orderName} مسجّل لدينا بالفعل`,
          });
        }
      }

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
          requestId,
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
      const priceById = new Map(
        [...productLookup(result.products)].map(([id, p]) => [id, Number(p.price) || 0])
      );
      const total = order.items.reduce(
        (sum, i) => sum + (priceById.get(i.productId) || 0) * (i.quantity || 0),
        0
      );

      await orders.createOrder({
        orderName,
        invoiceName,
        userId: orderSession?.userId,
        requestId,
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
      // Admin-only — nothing in the frontend calls this, and unauthenticated it
      // let anyone enumerate small sequential ids to read another customer's
      // order (name, amount, status). Payment status changes already have a
      // dedicated admin route (PATCH /api/admin/orders/:id); this one exists
      // for the dashboard to look up a single invoice.
      if (!(await requireAdmin(req, res))) return;
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
      // Admin-only — this records a real Odoo payment for a client-chosen
      // amount against a client-chosen invoice id. It was reachable with no
      // session check at all; nothing in the frontend calls it either.
      if (!(await requireAdmin(req, res))) return;
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
        const paid = await orders.updateOrder(found.orderName, { paymentStatus: 'paid', paidAt });
        void push.notifyOrderStage(found, paid || { ...found, paymentStatus: 'paid' });
        return sendJson(res, 200, { invoiceId, status: 'paid', paidAt });
      }

      const result = await odoo.recordPayment(Number(invoiceId), payment.amount);

      // Keep the local record (used by "my orders" / the admin dashboard) in
      // sync with the payment Odoo just recorded.
      const found = await orders.getOrderByInvoiceName(invoiceId);
      if (found) {
        const paid = await orders.updateOrder(found.orderName, {
          paymentStatus: 'paid',
          paidAt: result.recordedAt,
        });
        void push.notifyOrderStage(found, paid || { ...found, paymentStatus: 'paid' });
      }

      return sendJson(res, 200, { invoiceId, status: 'paid', recordedAt: result.recordedAt });
    }

    return NOT_HANDLED;
  };
}

module.exports = { createOrderRoutes, NOT_HANDLED };
