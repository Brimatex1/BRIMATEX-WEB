/**
 * Orders and invoices - the heart of the shop.
 *
 * POST /api/orders is the only route that creates money, and with it comes
 * order idempotency (requestId), which protects against two orders from one
 * checkout attempt when the network drops before the reply reaches the phone.
 * Guarded by tests/idempotency.check.js.
 *
 * Invoices sit here because they are an order's payment record, not a domain
 * of their own.
 *
 * Moved verbatim out of handleApi with no logic change.
 */
'use strict';

const odoo = require('../lib/odoo');
const auth = require('../lib/auth');
const orders = require('../lib/orders');
const push = require('../lib/push');
const whatsapp = require('../lib/whatsapp');
const metaCapi = require('../lib/meta-capi');
const perks = require('../lib/perks');
const settings = require('../lib/settings');
const { getProducts, productLookup } = require('../lib/catalogue');
const { preorderNote } = require('../lib/preorder');
const { sendJson, readBody } = require('../lib/respond');

/** Same as its counterpart in routes/auth.js - see the explanation there. */
const NOT_HANDLED = Symbol('order-route-not-handled');

/**
 * Where an order was placed. Both clients now say so; for app builds shipped
 * before the field existed, the requestId only the app sends gives it away.
 * Null when neither is known.
 */
function orderChannel(order) {
  if (order.channel === 'web' || order.channel === 'app') return order.channel;
  if (order.tracking && typeof order.tracking === 'object') return 'web';
  if (typeof order.requestId === 'string' && order.requestId.trim()) return 'app';
  return null;
}

/**
 * Reports a website purchase to Meta's Conversions API, in the background.
 *
 * Website orders only: app orders stay out, because the Meta dataset is not
 * connected to an app and would reject them - and counting them as website
 * sales would credit web ads with app sales. They are still kept apart in the
 * dashboard through `channel`.
 *
 * Started before the reply goes out, so the server's copy - the one with the
 * hashed phone and name - usually reaches Meta ahead of the browser's, and
 * that is the copy Meta keeps when it deduplicates.
 */
function reportPurchase(req, order, { channel, orderName, total, userId, products }) {
  if (channel !== 'web' || !metaCapi.isConfigured()) return;
  const { pixelId, lydPerUsd } = settings.readPublicFacebookPixel();
  if (!pixelId) return;

  const tracking = order.tracking && typeof order.tracking === 'object' ? order.tracking : {};
  const prices = new Map([...productLookup(products)].map(([id, p]) => [id, Number(p.price) || 0]));
  const event = metaCapi.buildPurchase({
    req,
    orderName,
    customer: order.customer,
    items: order.items,
    total,
    userId,
    lydPerUsd,
    prices,
    tracking: {
      eventSourceUrl: typeof tracking.eventSourceUrl === 'string' ? tracking.eventSourceUrl.slice(0, 500) : undefined,
      fbp: typeof tracking.fbp === 'string' ? tracking.fbp.slice(0, 200) : undefined,
      fbc: typeof tracking.fbc === 'string' ? tracking.fbc.slice(0, 500) : undefined,
    },
  });
  // send() never throws; the catch only guards against a bug in it.
  metaCapi.send(pixelId, [event]).catch((err) => console.error('[Meta CAPI]', err.message));
}

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
      const channel = orderChannel(order);

      const orderToken = req.headers.authorization?.split(' ')[1];
      const orderSession = orderToken ? await auth.verifySession(orderToken) : null;

      // Catalogue prices by product (and size) id - the subtotal a voucher
      // discounts, and the demo order's total.
      const priceById = new Map(
        [...productLookup(result.products)].map(([id, p]) => [id, Number(p.price) || 0])
      );
      const subtotal = order.items.reduce(
        (sum, i) => sum + (priceById.get(i.productId) || 0) * (i.quantity || 0),
        0
      );

      // Voucher (src/lib/perks.js). Checked against the customer's own
      // vouchers, then claimed before the order exists - two orders at once
      // cannot both spend it. It becomes one discount line on the Odoo order,
      // and the note says which voucher, for the team reading the order.
      let voucher = null;
      let discount = null;
      let note = String(order.note || '');
      if (order.voucherCode) {
        if (!orderSession) return sendJson(res, 401, { error: 'سجّل الدخول لاستخدام القسيمة' });
        const found = await perks.findActiveVoucher(orderSession.userId, order.voucherCode);
        if (found.error) return sendJson(res, 400, { error: found.error });
        if (!(await perks.claimVoucher(orderSession.userId, found.voucher.code))) {
          return sendJson(res, 409, { error: 'استُخدمت هذه القسيمة من قبل' });
        }
        voucher = found.voucher;
        const amount = perks.discountAmount(voucher, subtotal);
        discount = { amount, label: `قسيمة ${voucher.code} — ${perks.discountLabel(voucher)}` };
        note = [note.trim(), `قسيمة: ${voucher.code} (${perks.discountLabel(voucher)}) — خصم ${amount} د.ل`]
          .filter(Boolean)
          .join('\n');
      }
      // Sizes out of stock ordered as pre-orders: the note tells the team what has to be made.
      const madeToOrder = preorderNote(order.items, result.products, settings.readPreorder());
      if (madeToOrder) note = [note.trim(), madeToOrder].filter(Boolean).join('\n');

      /** Gives the voucher back when the order could not be created. */
      const releaseVoucher = () =>
        voucher ? perks.releaseVoucher(orderSession.userId, voucher.code).catch(() => {}) : null;

      if (odoo.isConfigured()) {
        let odooResult;
        try {
          odooResult = await odoo.createSaleOrder(order.customer, order.items, note, discount);
        } catch (err) {
          await releaseVoucher();
          throw err;
        }
        if (voucher) await perks.attachVoucherToOrder(orderSession.userId, voucher.code, odooResult.name);

        // Persisted locally too — this used to return without saving anything,
        // so "my orders" and the admin dashboard never showed Odoo-backed orders.
        await orders.createOrder({
          orderName: odooResult.name,
          invoiceName: odooResult.invoiceName,
          userId: orderSession?.userId,
          requestId,
          channel,
          source: 'odoo',
          customer: order.customer,
          items: order.items,
          note,
          total: odooResult.total,
          invoiceStatus: odooResult.invoiceStatus,
          paymentStatus: 'unpaid',
          odooOrderId: odooResult.id,
          odooInvoiceId: odooResult.invoiceId,
          placedAt: new Date().toISOString(),
        });

        reportPurchase(req, order, {
          channel,
          orderName: odooResult.name,
          total: odooResult.total,
          userId: orderSession?.userId,
          products: result.products,
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
          discount: discount?.amount || 0,
          voucherCode: voucher?.code || null,
          message: `تم إنشاء الطلب ${odooResult.name} والفاتورة ${odooResult.invoiceName}`,
        });
      }

      // Demo mode: log the order locally with invoice simulation
      const orderName = `DEMO-${Date.now().toString().slice(-6)}`;
      const invoiceName = `INV-${Date.now().toString().slice(-6)}`;
      const total = Math.round((subtotal - (discount?.amount || 0)) * 100) / 100;

      try {
      await orders.createOrder({
        orderName,
        invoiceName,
        userId: orderSession?.userId,
        requestId,
        channel,
        source: 'demo',
        customer: order.customer,
        items: order.items,
        note,
        invoiceStatus: 'draft',
        paymentStatus: 'unpaid',
        // Persisted so the invoice lookup can report a real amount.
        total,
        placedAt: new Date().toISOString(),
      });
      } catch (err) {
        await releaseVoucher();
        throw err;
      }
      if (voucher) await perks.attachVoucherToOrder(orderSession.userId, voucher.code, orderName);

      reportPurchase(req, order, { channel, orderName, total, userId: orderSession?.userId, products: result.products });

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
        discount: discount?.amount || 0,
        voucherCode: voucher?.code || null,
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
