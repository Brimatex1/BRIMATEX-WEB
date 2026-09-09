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

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
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
  if (invoice === 'posted' || invoice === 'confirmed' || invoice === 'delivered') return 'shipping';
  return 'review';
}

/** No message for 'review': that is where every order starts, so it is not news. */
const MESSAGES = {
  shipping: (name) => ({
    title: 'طلبك في الطريق 🚚',
    body: `طلبك ${name} خرج للتوصيل. يتصل بك المندوب لتأكيد الموعد.`,
  }),
  done: (name) => ({
    title: 'تم تسليم طلبك ✅',
    body: `اكتمل طلبك ${name}. نتمنى لك نوماً هنيئاً — ورأيك يهمّنا.`,
  }),
  cancelled: (name) => ({
    title: 'أُلغي طلبك',
    body: `أُلغي طلبك ${name}. راسلنا على واتساب إن كان هذا غير متوقّع.`,
  }),
};

async function send(messages) {
  const results = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const slice = messages.slice(i, i + BATCH);
    try {
      const res = await http.postJson(EXPO_PUSH_URL, slice, { Accept: 'application/json' });
      results.push(...(res.data || []));
    } catch (err) {
      // A push failure must never take down the request that triggered it —
      // the order status change itself already succeeded.
      console.error('[Push] send failed:', err.message);
    }
  }
  return results;
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

    const { title, body } = build(after.orderName);
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
        r?.status === 'error' && r?.details?.error === 'DeviceNotRegistered'
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

module.exports = { notifyOrderStage, stageOf };
