// Order-status push notifications, delivered through Expo's push service.
//
// Why this exists: a mattress is built to order, so the journey is days, not
// minutes. "Your order entered production" is real information the website
// cannot deliver on iOS — it is the app's main reason to exist.
//
// Outbound HTTP goes through src/lib/http.js (node:https), never fetch — see
// src/lib/no-undici.js for why that is fatal on this host.

const http = require('./http');
const devices = require('./devices');

// A test server points this at a fake Expo (tests/panel-push.check.js).
const EXPO_PUSH_URL = process.env.BRIMATEX_EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo's documented maximum per request

/**
 * The customer-visible stage, derived exactly as the app derives it
 * (src/features/orderStatus.ts). Notifying on raw invoice fields would fire on
 * changes the customer never sees.
 *
 * Both vocabularies are accepted on purpose: Odoo writes `posted`/`cancel`,
 * while the admin dashboard writes `confirmed`/`delivered`/`cancelled`.
 */
function stageOf(order) {
  const invoice = String(order?.invoiceStatus || '');
  if (invoice === 'cancel' || invoice === 'cancelled') return 'cancelled';
  if (order?.paymentStatus === 'paid') return 'done';
  // 'confirmed': the order is confirmed in Odoo (or from the dashboard) and
  // is being prepared - it has not left yet. The app shows it as in review
  // until its next build learns the stage; the notification goes out now.
  if (invoice === 'confirmed') return 'confirmed';
  if (invoice === 'posted' || invoice === 'delivered') return 'shipping';
  return 'review';
}

/** No message for 'review': that is where every order starts, so it is not news. */
const MESSAGES = {
  confirmed: (name) => ({
    title: 'تم تأكيد طلبك',
    body: `أكّدنا طلبك ${name} وبدأنا تجهيزه. سنخبرك عند الشحن.`,
  }),
  // Sent when the warehouse validates the order's delivery slip in Odoo: the
  // goods have left with the driver. The slip's number is the warehouse's own
  // reference - never shown to the customer.
  shipping: (name) => ({
    title: 'طلبك في الطريق إليك 🚚',
    body: `طلبك ${name} في الطريق إليك. سيتصل بك السائق قبل الوصول.`,
  }),
  done: (name) => ({
    title: 'تم توصيل طلبك ✅',
    body: `تم توصيل طلبك ${name}. رأيك يهمّنا.`,
  }),
  cancelled: (name) => ({
    title: 'تم إلغاء الطلب',
    body: `تم إلغاء طلبك ${name}. تواصل معنا لإعادة الطلب أو اختيار موعد آخر.`,
  }),
};

/**
 * Sends Expo push messages, 100 per request, and returns one ticket per
 * message in the same order - null where a whole request failed, so a ticket
 * always lines up with the message (and the token) it answers.
 */
async function send(messages) {
  const results = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const slice = messages.slice(i, i + BATCH);
    try {
      const res = await http.postJson(EXPO_PUSH_URL, slice, { Accept: 'application/json' });
      const tickets = Array.isArray(res.data) ? res.data : [];
      results.push(...slice.map((_, j) => tickets[j] || null));
    } catch (err) {
      // A push failure must never take down the request that triggered it —
      // the order status change itself already succeeded.
      console.error('[Push] send failed:', err.message);
      results.push(...slice.map(() => null));
    }
  }
  return results;
}

/** Expo's answer for a token that no longer reaches a phone (the app was removed). */
function isDeadToken(ticket) {
  return ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered';
}

/**
 * Tells an order's devices that its stage moved. Does nothing when the stage
 * is unchanged, or when nobody registered a device for this order.
 *
 * Never throws: callers are status-change endpoints whose own work is done.
 */
async function notifyOrderStage(before, after) {
  try {
    const stage = stageOf(after);
    if (stage === stageOf(before)) return { sent: 0, reason: 'unchanged' };

    const build = MESSAGES[stage];
    if (!build) return { sent: 0, reason: 'no_message' };

    const targets = await devices.findForOrder({
      userId: after.userId,
      orderName: after.orderName,
    });
    if (!targets.length) return { sent: 0, reason: 'no_devices' };

    const { title, body } = build(after.orderName, after);
    const results = await send(
      targets.map((d) => ({
        to: d.token,
        title,
        body,
        sound: 'default',
        // Lets the app open straight to the order when the customer taps it.
        data: { kind: 'order-status', orderName: after.orderName, stage },
      }))
    );

    // Expo reports dead tokens as DeviceNotRegistered; keeping them only costs
    // us a failed request on every future notification.
    await Promise.all(
      results.map((r, i) =>
        isDeadToken(r)
          ? devices.remove(targets[i].token)
          : null
      )
    );

    const sent = results.filter((r) => r?.status === 'ok').length;
    console.log(`[Push] ${after.orderName} → ${stage}: ${sent}/${targets.length}`);
    return { sent, stage };
  } catch (err) {
    console.error('[Push] notify failed:', err.message);
    return { sent: 0, reason: err.message };
  }
}

module.exports = { notifyOrderStage, stageOf, send, isDeadToken };
