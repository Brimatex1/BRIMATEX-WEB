/**
 * Loyalty points and coupons, read from Odoo's own modules (`loyalty` and
 * `sale_loyalty`) - the owner's choice for the loyalty add-on. Nothing here
 * keeps its own tables or its own numbers: points per dinar, what a point is
 * worth, expiry and coupons are all set on the program in Odoo, and the app
 * and the website show whatever Odoo says.
 *
 * Until the modules are installed and a loyalty program is set up, every
 * reader answers `{ enabled: false }` and the shops hide the loyalty parts.
 *
 * Points OR one coupon per order, never both (the owner's rule).
 */
'use strict';

const odoo = require('./odoo');

const COUPON_TYPES = ['coupons', 'next_order_coupons', 'promo_code', 'promotion'];
const CACHE_MS = 5 * 60 * 1000;

let modelsCache = { at: 0, ok: false };

/** Are Odoo's loyalty models there at all (the module installed)? Cached for five minutes. */
async function modulesInstalled() {
  if (!odoo.isConfigured()) return false;
  if (Date.now() - modelsCache.at < CACHE_MS) return modelsCache.ok;
  let ok = false;
  try {
    const n = await odoo.call('ir.model', 'search_count', [[['model', 'in', ['loyalty.program', 'loyalty.card']]]]);
    ok = n >= 2;
  } catch {
    ok = false;
  }
  modelsCache = { at: Date.now(), ok };
  return ok;
}

/** `search` then `read` - this Odoo's search_read misbehaves on some models (src/lib/odoo.js findOrCreatePartner). */
async function find(model, domain, fields, kwargs = {}) {
  const ids = await odoo.call(model, 'search', [domain], kwargs);
  if (!ids.length) return [];
  return odoo.call(model, 'read', [ids], { fields });
}

const many2oneId = (v) => (Array.isArray(v) ? v[0] : v || null);
const round2 = (n) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

/** The customer's Odoo contact, by the phone they signed in with. Never creates one. */
async function partnerIdFor(user) {
  // The contact the account's orders went to, remembered at its first order (src/routes/orders.js).
  if (user?.odooPartnerId) return Number(user.odooPartnerId);
  if (!user?.phone) return null;
  const ids = await odoo.call('res.partner', 'search', [[['phone', 'in', odoo.phoneForms(user.phone)]]], {
    limit: 1,
    order: 'id desc',
  });
  return ids[0] || null;
}

/** The active points program, with how points are earned and what they are worth. */
async function pointsProgram() {
  const [program] = await find('loyalty.program', [['program_type', '=', 'loyalty'], ['active', '=', true]], ['id', 'name', 'rule_ids', 'reward_ids'], {
    limit: 1,
    order: 'sequence, id',
  });
  if (!program) return null;
  const rules = program.rule_ids?.length
    ? await odoo.call('loyalty.rule', 'read', [program.rule_ids], { fields: ['reward_point_amount', 'reward_point_mode', 'minimum_amount'] })
    : [];
  const rewards = program.reward_ids?.length
    ? await odoo.call('loyalty.reward', 'read', [program.reward_ids], { fields: ['reward_type', 'discount_mode', 'discount', 'required_points', 'description'] })
    : [];
  const money = rules.find((r) => r.reward_point_mode === 'money');
  const perOrder = rules.find((r) => r.reward_point_mode === 'order');
  const discountReward = rewards.find((r) => r.reward_type === 'discount' && (r.discount_mode === 'per_point' || r.required_points > 0));
  let pointValue = null;
  if (discountReward?.discount_mode === 'per_point') pointValue = Number(discountReward.discount) || null;
  else if (discountReward?.discount_mode === 'per_order' && discountReward.required_points > 0) {
    pointValue = Number(discountReward.discount) / Number(discountReward.required_points);
  }
  return {
    id: program.id,
    name: program.name,
    reward: discountReward || null,
    pointValue,
    earn: money
      ? { points: Number(money.reward_point_amount) || null, perAmount: 1, minimum: Number(money.minimum_amount) || 0 }
      : perOrder
        ? { points: Number(perOrder.reward_point_amount) || null, perAmount: null, minimum: Number(perOrder.minimum_amount) || 0 }
        : null,
  };
}

async function cardFor(programId, partnerId) {
  const [card] = await find('loyalty.card', [['program_id', '=', programId], ['partner_id', '=', partnerId]], ['id', 'points', 'expiration_date', 'code'], {
    limit: 1,
    order: 'id desc',
  });
  return card || null;
}

/** The card's movements (Odoo 18+'s loyalty.history), newest first, with the order's name where it was one. */
async function historyOf(cardId) {
  let rows = [];
  try {
    rows = await find('loyalty.history', [['card_id', '=', cardId]], ['id', 'description', 'issued', 'used', 'order_model', 'order_id', 'create_date'], {
      order: 'create_date desc',
      limit: 50,
    });
  } catch {
    return []; // an Odoo without the history model: the balance still shows
  }
  const orderIds = [...new Set(rows.filter((r) => r.order_model === 'sale.order' && r.order_id).map((r) => many2oneId(r.order_id)))];
  const names = orderIds.length ? new Map((await odoo.call('sale.order', 'read', [orderIds], { fields: ['name'] })).map((o) => [o.id, o.name])) : new Map();
  const out = [];
  for (const r of rows) {
    const orderName = r.order_model === 'sale.order' ? names.get(many2oneId(r.order_id)) || null : null;
    const date = r.create_date ? new Date(`${r.create_date.replace(' ', 'T')}Z`).toISOString() : null;
    if (Number(r.issued) > 0) {
      out.push({ id: `${r.id}-in`, kind: 'earned', points: Number(r.issued), orderName, label: orderName ? `طلب #${orderName}` : r.description || 'نقاط', date, afterDelivery: Boolean(orderName) });
    }
    if (Number(r.used) > 0) {
      out.push({ id: `${r.id}-out`, kind: 'redeemed', points: Number(r.used), orderName, label: orderName ? `خصم على طلب #${orderName}` : r.description || 'استخدام نقاط', date, afterDelivery: false });
    }
  }
  return out;
}

/** What a coupon program gives: a fixed amount or a percentage, and from what order total. */
async function couponTerms(programIds) {
  if (!programIds.length) return new Map();
  const programs = await odoo.call('loyalty.program', 'read', [programIds], { fields: ['id', 'name', 'program_type', 'rule_ids', 'reward_ids', 'active'] });
  const out = new Map();
  for (const p of programs) {
    const [reward] = p.reward_ids?.length ? await odoo.call('loyalty.reward', 'read', [[p.reward_ids[0]]], { fields: ['discount_mode', 'discount', 'description'] }) : [];
    const [rule] = p.rule_ids?.length ? await odoo.call('loyalty.rule', 'read', [[p.rule_ids[0]]], { fields: ['minimum_amount'] }) : [];
    out.set(p.id, {
      title: reward?.description || p.name,
      value: reward?.discount_mode === 'per_order' ? Number(reward.discount) : null,
      percent: reward?.discount_mode === 'percent' ? Number(reward.discount) : null,
      minAmount: Number(rule?.minimum_amount) || null,
      active: p.active !== false,
    });
  }
  return out;
}

/** GET /api/user/coupons: the customer's coupons, the ones still usable and the ones spent or expired. */
async function coupons(user) {
  if (!(await modulesInstalled())) return { enabled: false, available: [], used: [] };
  const partnerId = await partnerIdFor(user);
  if (!partnerId) return { enabled: true, available: [], used: [] };
  const cards = await find(
    'loyalty.card',
    [['partner_id', '=', partnerId], ['program_id.program_type', 'in', COUPON_TYPES]],
    ['id', 'code', 'points', 'expiration_date', 'program_id', 'write_date'],
    { order: 'id desc', limit: 50 }
  );
  const terms = await couponTerms([...new Set(cards.map((c) => many2oneId(c.program_id)))]);
  const available = [];
  const used = [];
  for (const c of cards) {
    const t = terms.get(many2oneId(c.program_id));
    if (!t) continue;
    const row = { code: c.code, title: t.title, value: t.value, percent: t.percent, minAmount: t.minAmount, expires: c.expiration_date || null, usedAt: null };
    const expired = c.expiration_date && c.expiration_date < today();
    if (Number(c.points) > 0 && !expired && t.active) available.push(row);
    else used.push({ ...row, usedAt: c.write_date ? new Date(`${c.write_date.replace(' ', 'T')}Z`).toISOString() : null });
  }
  return { enabled: true, available, used };
}

/** GET /api/user/loyalty: the balance, what it is worth, what expires, how to earn, and the history. */
async function summary(user) {
  if (!(await modulesInstalled())) return { enabled: false };
  const program = await pointsProgram();
  if (!program) return { enabled: false };
  const partnerId = await partnerIdFor(user);
  const card = partnerId ? await cardFor(program.id, partnerId) : null;
  const points = Number(card?.points) || 0;
  const { available } = await coupons(user).catch(() => ({ available: [] }));
  return {
    enabled: true,
    points,
    value: program.pointValue ? round2(points * program.pointValue) : null,
    pointValue: program.pointValue,
    expiring: card?.expiration_date && points > 0 ? { points, date: card.expiration_date } : null,
    earn: program.earn ? { points: program.earn.points, perAmount: program.earn.perAmount, review: null } : null,
    history: card ? await historyOf(card.id) : [],
    couponsAvailable: available.length,
  };
}

/** The discount a coupon gives on this subtotal. */
function couponDiscount(t, subtotal) {
  if (t.value) return round2(Math.min(t.value, subtotal));
  if (t.percent) return round2((subtotal * t.percent) / 100);
  return 0;
}

/**
 * POST /api/user/coupons/check: is this code usable now, on this subtotal?
 * A coupon card's own code, or a promotion program's code (its rule's code).
 */
async function checkCoupon(user, code, subtotal) {
  const clean = String(code || '').trim();
  if (!clean) return { error: 'أدخل رمز القسيمة' };
  if (!(await modulesInstalled())) return { error: 'القسائم غير متاحة حالياً' };
  const partnerId = await partnerIdFor(user);
  const [card] = await find('loyalty.card', [['code', '=', clean], ['program_id.program_type', 'in', COUPON_TYPES]], ['id', 'points', 'expiration_date', 'partner_id', 'program_id'], {
    limit: 1,
  });
  let programId = null;
  if (card) {
    const owner = many2oneId(card.partner_id);
    if (owner && owner !== partnerId) return { error: 'الرمز غير صحيح أو منتهي' };
    if (!(Number(card.points) > 0) || (card.expiration_date && card.expiration_date < today())) return { error: 'الرمز غير صحيح أو منتهي' };
    programId = many2oneId(card.program_id);
  } else {
    const [rule] = await find('loyalty.rule', [['code', '=', clean], ['program_id.active', '=', true]], ['program_id'], { limit: 1 });
    if (!rule) return { error: 'الرمز غير صحيح أو منتهي' };
    programId = many2oneId(rule.program_id);
  }
  const t = (await couponTerms([programId])).get(programId);
  if (!t || !t.active) return { error: 'الرمز غير صحيح أو منتهي' };
  const total = Number(subtotal) || 0;
  if (t.minAmount && total < t.minAmount) return { error: `هذه القسيمة للطلبات فوق ${t.minAmount} د.ل` };
  return { coupon: { code: clean, title: t.title, value: t.value, percent: t.percent, discount: couponDiscount(t, total) } };
}

/** Reads what a new order's `loyalty` field asks for: { usePoints } or { coupon }, never both. */
function readRequest(input) {
  if (!input || typeof input !== 'object') return { request: null };
  const usePoints = input.usePoints === true;
  const coupon = typeof input.coupon === 'string' && input.coupon.trim() ? input.coupon.trim().slice(0, 64) : null;
  if (usePoints && coupon) return { error: 'استخدم نقاطك أو قسيمة واحدة في الطلب، لا الاثنين معاً' };
  if (!usePoints && !coupon) return { request: null };
  return { request: usePoints ? { usePoints: true } : { coupon } };
}

/**
 * Applies the request to the new Odoo order through sale_loyalty's own
 * wizards - the same buttons the team has on the order - so Odoo writes the
 * reward line and spends the points or the coupon. Returns the order's new
 * total, or `{ error }` when Odoo refused (the order stays, without it).
 */
async function applyToOrder(orderId, request) {
  if (!request) return { applied: false };
  if (request.coupon) {
    const wizardId = await odoo.call('sale.loyalty.coupon.wizard', 'create', [{ order_id: orderId, coupon_code: request.coupon }]);
    await odoo.call('sale.loyalty.coupon.wizard', 'action_apply', [[wizardId]]);
  } else {
    const program = await pointsProgram();
    if (!program?.reward) return { error: 'لا توجد مكافأة نقاط في برنامج الولاء' };
    const wizardId = await odoo.call('sale.loyalty.reward.wizard', 'create', [{ order_id: orderId, selected_reward_id: program.reward.id }]);
    await odoo.call('sale.loyalty.reward.wizard', 'action_apply', [[wizardId]]);
  }
  const [order] = await odoo.call('sale.order', 'read', [[orderId]], { fields: ['amount_total'] });
  return { applied: true, total: order?.amount_total ?? null };
}

module.exports = { summary, coupons, checkCoupon, readRequest, applyToOrder, modulesInstalled, _reset: () => (modelsCache = { at: 0, ok: false }) };
