/**
 * The admin panel's view of orders (/admin and /admin/orders) - pure functions
 * over the local order records, so they can be tested without a server.
 *
 * An order's status is the storefront's stage (push.stageOf, the same rules as
 * web/src/lib/orderStatus.ts and the apps): Odoo's sale order confirmed, its
 * delivery slip validated, the payment recorded - kept in step with Odoo by
 * the order sync. The panel shows six of them:
 *
 *   new        جديد           placed, not confirmed yet ("review")
 *   confirmed  مؤكد           confirmed in Odoo
 *   preparing  قيد التجهيز    confirmed, and made to order (a pre-order being made)
 *   out        خرج للتوصيل    the delivery slip was validated
 *   delivered  تم التسليم     the payment was recorded
 *   cancelled  ملغي
 *
 * The channel: orders record 'web' or 'app'; the app's iOS / Android split
 * comes from the device that registered for the order (src/lib/devices.js).
 */
'use strict';

const { stageOf } = require('./push');
const { leadDaysFromNote } = require('./preorder');
const { libyaToday } = require('./delivery');

const STATUSES = ['new', 'confirmed', 'preparing', 'out', 'delivered', 'cancelled'];
const CHANNELS = ['ios', 'android', 'app', 'web'];
const PERIODS = ['today', '7d', '30d', 'all'];

/** Libya is UTC+2 all year. */
const LIBYA_OFFSET_MS = 2 * 3600_000;
const DAY_MS = 86_400_000;
/** «يحتاج انتباهك»: a new order waiting longer than this. */
const WAITING_TOO_LONG_MS = 2 * 3600_000;

/** A record with its times as ISO strings - Postgres hands back Date objects. */
function normalize(order) {
  const iso = (v) => (v instanceof Date ? v.toISOString() : v || null);
  return { ...order, placedAt: iso(order.placedAt || order.receivedAt), paidAt: iso(order.paidAt), shippedAt: iso(order.shippedAt) };
}

function statusOf(order) {
  const stage = stageOf(order);
  if (stage === 'review') return 'new';
  if (stage === 'confirmed') return leadDaysFromNote(order.note) != null ? 'preparing' : 'confirmed';
  if (stage === 'shipping') return 'out';
  if (stage === 'done') return 'delivered';
  return 'cancelled';
}

/**
 * Who placed it: 'ios' | 'android' when the app's device is known, 'app' when
 * it came from the app on a device we cannot name, 'web' otherwise (orders
 * from before the channel was recorded were the website's).
 *
 * `platforms` is devices.listPlatforms(): a device's last order names it; an
 * account whose devices all share one platform names its orders too.
 */
function platformIndex(platforms = []) {
  const byOrder = new Map();
  const byUser = new Map();
  for (const d of platforms) {
    const p = d.platform === 'android' ? 'android' : d.platform === 'ios' ? 'ios' : null;
    if (!p) continue;
    if (d.lastOrder) byOrder.set(d.lastOrder, p);
    if (d.userId) {
      const seen = byUser.get(d.userId);
      byUser.set(d.userId, seen && seen !== p ? 'mixed' : p);
    }
  }
  return { byOrder, byUser };
}

function channelOf(order, index) {
  if (order.channel !== 'app') return 'web';
  const p = index?.byOrder.get(order.orderName) || index?.byUser.get(order.userId);
  return p === 'ios' || p === 'android' ? p : 'app';
}

/** The Libyan calendar day of an instant, YYYY-MM-DD. */
function libyaDay(iso) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? new Date(t + LIBYA_OFFSET_MS).toISOString().slice(0, 10) : '';
}

/** The first Libyan day a period covers, or '' for all time. */
function periodStart(period, now = new Date()) {
  const today = libyaToday(now);
  const back = { today: 0, '7d': 6, '30d': 29 }[period];
  if (back == null) return '';
  return new Date(Date.parse(`${today}T00:00:00Z`) - back * DAY_MS).toISOString().slice(0, 10);
}

/** The app's checkout choices, read back from the note the server wrote (src/lib/delivery.js). */
function deliveryFromNote(note) {
  const text = String(note || '');
  if (/الاستلام: استلام من الصالة/.test(text)) return 'استلام من الصالة';
  return text.match(/موعد التوصيل: (.+)/)?.[1]?.trim() || null;
}

function paymentFromNote(note) {
  return String(note || '').match(/الدفع عند الاستلام: (.+)/)?.[1]?.trim() || null;
}

/** «بالانس 180×200 · كلاسيك 90×190 × 2» - the catalogue's names, else the product id. */
function itemsText(items, lookup) {
  return (Array.isArray(items) ? items : [])
    .map((i) => {
      const p = lookup?.get(Number(i.productId));
      let name = p ? String(p.name || '').trim() : `#${i.productId}`;
      const size = p ? p.label || p.size?.label || '' : '';
      if (size && !name.includes(String(size).replace(/\s*سم$/, ''))) name = `${name} ${size}`;
      const qty = Number(i.quantity) || 1;
      return qty > 1 ? `${name} × ${qty}` : name;
    })
    .join(' · ');
}

/** One order as the panel's table shows it. */
function toRow(order, { index, lookup, odooUrl } = {}) {
  return {
    orderName: order.orderName,
    placedAt: order.placedAt || null,
    customer: { name: order.customer?.name || '', phone: order.customer?.phone || '' },
    city: order.customer?.city || '',
    channel: channelOf(order, index),
    products: itemsText(order.items, lookup),
    total: Number(order.total) || 0,
    payment: paymentFromNote(order.note),
    status: statusOf(order),
    delivery: deliveryFromNote(order.note),
    odooLink: odooUrl && order.odooOrderId ? `${odooUrl}/odoo/sales/${order.odooOrderId}` : null,
    customerKey: customerKeyOf(order),
  };
}

/** Lower-case text an order is searched by. */
function haystack(order, lookup) {
  return [
    order.orderName,
    order.invoiceName,
    order.customer?.name,
    order.customer?.phone,
    order.customer?.city,
    itemsText(order.items, lookup),
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
}

/** Reads and checks the list's query: unknown values fall back to «الكل». */
function readQuery(params) {
  const get = (k) => String(params.get(k) || '').trim();
  const status = STATUSES.includes(get('status')) ? get('status') : 'all';
  const channel = CHANNELS.includes(get('channel')) ? get('channel') : 'all';
  // «الكل» by default: on a day with no orders yet, «اليوم» showed an empty list
  // while the sidebar counted the new ones still waiting from earlier days.
  const period = PERIODS.includes(get('period')) ? get('period') : 'all';
  const page = Math.max(1, Math.floor(Number(get('page')) || 1));
  const perPage = Math.min(20, Math.max(8, Math.floor(Number(get('perPage')) || 10)));
  return { status, channel, city: get('city').slice(0, 60), period, q: get('q').slice(0, 80), page, perPage };
}

/**
 * The orders list: the filters (channel, city, period, search) narrow the
 * orders; the status chips count within them, and the status picks the page.
 */
function listOrders(all, query, { index, lookup, odooUrl, now = new Date() } = {}) {
  const from = periodStart(query.period, now);
  const q = query.q.toLowerCase();
  const filtered = all.filter((o) => {
    if (query.channel !== 'all') {
      const ch = channelOf(o, index);
      if (query.channel === 'app' ? ch === 'web' : ch !== query.channel) return false;
    }
    if (query.city && String(o.customer?.city || '').trim() !== query.city) return false;
    if (from && libyaDay(o.placedAt) < from) return false;
    if (q && !haystack(o, lookup).includes(q)) return false;
    return true;
  });

  const counts = { all: filtered.length };
  for (const s of STATUSES) counts[s] = 0;
  for (const o of filtered) counts[statusOf(o)] += 1;

  const shown = query.status === 'all' ? filtered : filtered.filter((o) => statusOf(o) === query.status);
  const sorted = [...shown].sort((a, b) => String(b.placedAt).localeCompare(String(a.placedAt)));
  const pages = Math.max(1, Math.ceil(sorted.length / query.perPage));
  const page = Math.min(query.page, pages);
  const rows = sorted.slice((page - 1) * query.perPage, page * query.perPage).map((o) => toRow(o, { index, lookup, odooUrl }));

  // Every city ever ordered to, for the filter.
  const cities = [...new Set(all.map((o) => String(o.customer?.city || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ar')
  );

  return { orders: rows, counts, total: sorted.length, page, pages, perPage: query.perPage, cities };
}

/** The numbers on نظرة عامة. */
function overview(all, { index, now = new Date() } = {}) {
  const today = libyaToday(now);
  const weekFrom = periodStart('7d', now);
  const nowMs = now.getTime();

  const todays = all.filter((o) => libyaDay(o.placedAt) === today);
  const pending = all.filter((o) => statusOf(o) === 'new');
  const oldestPendingAt = pending.reduce((min, o) => (!min || String(o.placedAt) < min ? o.placedAt : min), null);
  const sales = (list) =>
    Math.round(list.filter((o) => statusOf(o) !== 'cancelled').reduce((t, o) => t + (Number(o.total) || 0), 0) * 100) / 100;

  const week = all.filter((o) => libyaDay(o.placedAt) >= weekFrom);
  const channels = ['ios', 'android', 'app', 'web']
    .map((key) => {
      const list = week.filter((o) => channelOf(o, index) === key);
      const cancelled = list.filter((o) => statusOf(o) === 'cancelled').length;
      return {
        key,
        orders: list.length,
        sales: sales(list),
        cancelRate: list.length ? Math.round((cancelled / list.length) * 1000) / 10 : 0,
      };
    })
    // An app order whose device is unknown gets its own row only when there is one.
    .filter((c) => c.key !== 'app' || c.orders > 0);

  return {
    today: {
      orders: todays.length,
      sales: sales(todays),
    },
    pending: { count: pending.length, oldestAt: oldestPendingAt },
    outForDelivery: all.filter((o) => statusOf(o) === 'out').length,
    waitingTooLong: pending.filter((o) => nowMs - Date.parse(o.placedAt) > WAITING_TOO_LONG_MS).length,
    channels,
  };
}

/* ───────────── An order's page, and a customer's ───────────── */

/** «يوم» · «يومين» · «3 أيام» · «11 يوماً». */
function leadText(days) {
  const n = Number(days) || 1;
  if (n === 1) return 'يوم';
  if (n === 2) return 'يومين';
  return n <= 10 ? `${n} أيام` : `${n} يوماً`;
}

/** The last nine digits of a phone - 0912345678, +218912345678 and 218912345678 are one number. */
function phoneKey(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
}

/**
 * Who placed an order, as the customer page's address: `u:<account id>` when
 * signed in, else `p:<phone>` - a guest is known by the phone they gave.
 */
function customerKeyOf(order) {
  if (order.userId) return `u:${order.userId}`;
  const key = phoneKey(order.customer?.phone);
  return key ? `p:0${key}` : null;
}

/**
 * The stages an order goes through, for its page: each done, current or still
 * to come, with its time when the order records one. A preorder has its own
 * «قيد التجهيز»; a cancelled order ends at «ملغى».
 */
function timelineOf(order) {
  const status = statusOf(order);
  const preorder = leadDaysFromNote(order.note) != null;
  const placed = { key: 'new', label: 'استلمنا الطلب', at: order.placedAt || null };
  if (status === 'cancelled') {
    return [
      { ...placed, state: 'done' },
      { key: 'cancelled', label: 'ملغى', at: order.cancelledAt || null, state: 'current' },
    ];
  }
  const steps = [
    placed,
    { key: 'confirmed', label: 'تم التأكيد', at: order.confirmedAt || null },
    ...(preorder ? [{ key: 'preparing', label: `قيد التجهيز (يُصنع خلال ${leadText(leadDaysFromNote(order.note))})`, at: null }] : []),
    { key: 'out', label: 'خرج للتوصيل', at: order.shippedAt || null },
    { key: 'delivered', label: 'تم التسليم', at: order.paidAt || null },
  ];
  // A confirmed preorder is «قيد التجهيز»; a plain confirmed one stops at «تم التأكيد».
  const current = status === 'delivered' ? steps.length - 1 : steps.findIndex((s) => s.key === status);
  return steps.map((s, i) => ({ ...s, state: status === 'delivered' || i < current ? 'done' : i === current ? 'current' : 'todo' }));
}

/** The note's lines, without the ones the page shows elsewhere (delivery, payment). */
function noteLines(note) {
  return String(note || '')
    .replace(/<\/?p>/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(الاستلام|موعد التوصيل|الدفع عند الاستلام):/.test(l));
}

/** GET /api/panel/orders/:name - everything about one order. */
function orderDetail(order, { index, lookup, odooUrl } = {}) {
  const items = (Array.isArray(order.items) ? order.items : []).map((i) => {
    const p = lookup?.get(Number(i.productId));
    const quantity = Number(i.quantity) || 1;
    const unitPrice = Number(i.price) > 0 ? Number(i.price) : Number(p?.price) > 0 ? Number(p.price) : null;
    const size = p ? p.label || p.size?.label || '' : '';
    return {
      productId: Number(i.productId),
      name: p ? String(p.name || '').trim() : `#${i.productId}`,
      size: size && !String(p?.name || '').includes(String(size).replace(/\s*سم$/, '')) ? size : '',
      quantity,
      unitPrice,
      lineTotal: unitPrice != null ? unitPrice * quantity : null,
      image: p?.image || null,
    };
  });
  const text = String(order.note || '');
  return {
    ...toRow(order, { index, lookup, odooUrl }),
    invoiceName: order.invoiceName || null,
    timeline: timelineOf(order),
    items,
    pickup: /الاستلام: استلام من الصالة/.test(text),
    notes: noteLines(text),
    address: String(order.customer?.address || '').trim(),
    customerKey: customerKeyOf(order),
  };
}

/**
 * GET /api/panel/customers/:key - one customer: the account (if any), every
 * order they placed - by the account or by the phone a guest gave - with the
 * totals, the addresses and names they used, and their devices.
 */
function customerProfile({ key, user, orders: all, addresses = [], platforms = [], reviews = [], index, lookup, odooUrl }) {
  const phone = user?.phone || (key.startsWith('p:') ? key.slice(2) : '');
  const pk = phoneKey(phone);
  const mine = all.filter((o) => (user && o.userId === user.id) || (pk && phoneKey(o.customer?.phone) === pk));
  const sorted = [...mine].sort((a, b) => String(b.placedAt).localeCompare(String(a.placedAt)));
  const counted = sorted.filter((o) => statusOf(o) !== 'cancelled');
  const spent = counted.reduce((s, o) => s + (Number(o.total) || 0), 0);

  const seen = new Set();
  const places = [];
  for (const a of [
    ...addresses.map((x) => ({ city: x.city, address: x.address })),
    ...sorted.map((o) => ({ city: o.customer?.city, address: o.customer?.address })),
  ]) {
    const city = String(a.city || '').trim();
    const address = String(a.address || '').trim();
    const k = `${city}|${address}`;
    if ((city || address) && !seen.has(k)) {
      seen.add(k);
      places.push({ city, address });
    }
  }
  const names = [...new Set([user?.name, ...sorted.map((o) => o.customer?.name)].map((n) => String(n || '').trim()).filter(Boolean))];
  const orderNames = new Set(sorted.map((o) => o.orderName));
  const devices = platforms
    .filter((d) => (user && d.userId === user.id) || (d.lastOrder && orderNames.has(d.lastOrder)))
    .map((d) => d.platform)
    .filter((p) => p === 'ios' || p === 'android');
  const myReviews = reviews.filter((r) => pk && phoneKey(r.phone) === pk);

  return {
    key,
    account: user ? { id: user.id, name: user.name || '', phone: user.phone || '', createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null } : null,
    name: names[0] || '',
    otherNames: names.slice(1),
    phone,
    stats: {
      orders: sorted.length,
      delivered: sorted.filter((o) => statusOf(o) === 'delivered').length,
      cancelled: sorted.length - counted.length,
      spent,
      average: counted.length ? Math.round(spent / counted.length) : 0,
      firstAt: sorted.length ? sorted[sorted.length - 1].placedAt : null,
      lastAt: sorted.length ? sorted[0].placedAt : null,
    },
    places,
    devices: { ios: devices.filter((p) => p === 'ios').length, android: devices.filter((p) => p === 'android').length },
    reviews: myReviews.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment || r.title || '', createdAt: r.createdAt, productId: r.productId })),
    orders: sorted.map((o) => toRow(o, { index, lookup, odooUrl })),
  };
}

module.exports = {
  STATUSES,
  CHANNELS,
  PERIODS,
  normalize,
  statusOf,
  platformIndex,
  channelOf,
  libyaDay,
  periodStart,
  deliveryFromNote,
  paymentFromNote,
  itemsText,
  toRow,
  readQuery,
  listOrders,
  overview,
  phoneKey,
  customerKeyOf,
  timelineOf,
  orderDetail,
  customerProfile,
};
