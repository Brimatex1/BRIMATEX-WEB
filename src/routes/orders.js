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

const { rateKey } = require('../lib/clientIp');
const odoo = require('../lib/odoo');
const auth = require('../lib/auth');
const orders = require('../lib/orders');
const push = require('../lib/push');
const whatsapp = require('../lib/whatsapp');
const metaCapi = require('../lib/meta-capi');
const perks = require('../lib/perks');
const loyalty = require('../lib/loyalty');
const settings = require('../lib/settings');
const { getProducts, productLookup } = require('../lib/catalogue');
const { stockNote } = require('../lib/availability');
const { sendJson, readBody } = require('../lib/respond');
const { readDelivery } = require('../lib/delivery');
const appSettings = require('../lib/appSettings');

/**
 * Arabic-Indic (٠١٢…) and Persian (۰۱۲…) digits as 0-9 - what a phone set to
 * Arabic types. Same as toLatinDigits in web/src/lib/utils.ts; done here too so
 * every client's orders reach Odoo and WhatsApp with a dialable number.
 */
function toLatinDigits(value) {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

/** Same as its counterpart in routes/auth.js - see the explanation there. */
const NOT_HANDLED = Symbol('order-route-not-handled');

/** The last clock stamp a demo order's number was cut from. */
let lastDemoStamp = 0;

/**
 * A demo order's number: the clock's last six digits, never the same twice.
 * Two orders can land in one millisecond (CI placed two app orders in the same
 * one, and the panel then showed one under the other's name), and the six
 * digits come round every ~17 minutes while the store outlives a restart - so
 * the stamp moves past the last one handed out and past any stored name. Each
 * try is reserved before the store is asked, so concurrent orders never pick
 * the same one.
 */
async function nextDemoNumber() {
  let stamp = Math.max(Date.now(), lastDemoStamp + 1);
  lastDemoStamp = stamp;
  while (await orders.getOrderByName(`DEMO-${String(stamp).slice(-6)}`)) {
    stamp = Math.max(stamp, lastDemoStamp) + 1;
    lastDemoStamp = stamp;
  }
  return String(stamp).slice(-6);
}

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
      referrerUrl: typeof tracking.referrerUrl === 'string' ? tracking.referrerUrl.slice(0, 500) : undefined,
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
      const clientIp = rateKey(req);
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
      if (typeof order?.customer?.phone === 'string') order.customer.phone = toLatinDigits(order.customer.phone);
      const result = await getProducts();
      const validationError = validateOrder(order, result.products);
      if (validationError) return sendJson(res, 400, { error: validationError });
      // The app's checkout: home delivery on a day and a slot, or the showroom; how it is paid.
      const delivery = readDelivery(order);
      if (delivery.error) return sendJson(res, 400, { error: delivery.error });

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

      // Maintenance (the panel's «وضع الصيانة»): no new order from any client,
      // whatever its screens show. A retry of an order placed before it began
      // still gets its reply above.
      const app = await appSettings.current();
      if (app.maintenance.on) {
        return sendJson(res, 503, { error: app.maintenance.message, code: 'maintenance' });
      }

      // Orders are accepted without an account, but stamp the owner when the
      // request carries a valid session so "my orders" can find them later.
      const channel = orderChannel(order);

      const orderToken = req.headers.authorization?.split(' ')[1];
      const orderSession = orderToken ? await auth.verifySession(orderToken) : null;
      // Every order comes from an account - its number proved by a WhatsApp code
      // when it was opened. The website and the apps ask for it before checkout;
      // here it is what stops orders sent straight to the server under a made-up
      // number. The test suite's servers alone take orders without one.
      if (!orderSession && process.env.BRIMATEX_ALLOW_UNVERIFIED !== '1') {
        return sendJson(res, 401, { error: 'سجّل الدخول لإتمام الطلب', code: 'login_required' });
      }

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
      // Loyalty add-on (src/lib/loyalty.js): the customer's points or one Odoo
      // coupon - not both, and not with an old voucher. Odoo applies it on the
      // order once it exists; the note says what was asked, for the team.
      const loyaltyAsk = loyalty.readRequest(order.loyalty);
      if (loyaltyAsk.error) return sendJson(res, 400, { error: loyaltyAsk.error });
      if (loyaltyAsk.request) {
        if (!orderSession) return sendJson(res, 401, { error: 'سجّل الدخول لاستخدام النقاط أو القسيمة' });
        if (voucher) return sendJson(res, 400, { error: 'استخدم قسيمة واحدة في الطلب' });
        note = [note.trim(), loyaltyAsk.request.usePoints ? 'يستخدم الزبون نقاطه في هذا الطلب' : `قسيمة: ${loyaltyAsk.request.coupon}`]
          .filter(Boolean)
          .join('\n');
      }
      if (delivery.noteLines) note = [note.trim(), ...delivery.noteLines].filter(Boolean).join('\n');
      // Sizes not in stock: the note tells the warehouse (the customer saw only the later delivery days).
      const madeToOrder = stockNote(order.items, result.products, settings.readDeliveryTimes());
      if (madeToOrder) note = [note.trim(), madeToOrder].filter(Boolean).join('\n');

      /** Gives the voucher back when the order could not be created. */
      const releaseVoucher = () =>
        voucher ? perks.releaseVoucher(orderSession.userId, voucher.code).catch(() => {}) : null;

      if (odoo.isConfigured()) {
        let odooResult;
        try {
          // Each line carries the catalogue's price - the one the customer saw.
          const pricedItems = order.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: priceById.get(i.productId) || 0,
          }));
          odooResult = await odoo.createSaleOrder(order.customer, pricedItems, note, discount, {
            commitmentDate: delivery.commitmentDate,
          });
        } catch (err) {
          await releaseVoucher();
          throw err;
        }
        if (voucher) await perks.attachVoucherToOrder(orderSession.userId, voucher.code, odooResult.name);
        if (loyaltyAsk.request) {
          // Odoo's own wizards write the reward line and spend the points or
          // the coupon; the order total then includes it. A refusal leaves the
          // order as placed - the note tells the team what the customer asked.
          try {
            const applied = await loyalty.applyToOrder(odooResult.id, loyaltyAsk.request);
            if (applied.error) console.error('[loyalty] not applied to', odooResult.name, applied.error);
            else if (applied.total != null) odooResult.total = applied.total;
          } catch (err) {
            console.error('[loyalty] not applied to', odooResult.name, err.message);
          }
        }

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
      const demoNumber = await nextDemoNumber();
      const orderName = `DEMO-${demoNumber}`;
      const invoiceName = `INV-${demoNumber}`;
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
