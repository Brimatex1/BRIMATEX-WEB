/**
 * Offer notifications - the panel's «الإشعارات» (admin and marketing).
 *
 * Offers only: the order notifications stay automatic (src/lib/push.js) and
 * the sign-in code goes on WhatsApp. A campaign is a title (≤ 40), a text
 * (≤ 120), what a tap opens (a mattress, a category, the offers page, or just
 * the app) and an audience - always among the devices whose owner turned
 * «العروض» on in the app (src/lib/devices.js):
 *
 *   offers   everyone with «العروض» on
 *   city     those whose delivery city in the app is this one
 *   cart     those whose cart had something added in the last 7 days and is
 *            still full - an order empties it, so they have not ordered since
 *
 * Sent through Expo's push service (src/lib/push.js), the same one the order
 * notifications use: the apps register Expo tokens, and Expo hands the
 * message to Apple and Google.
 *
 * Rules, enforced here and not only in the panel:
 *   - nothing is delivered in the quiet hours of «الإعدادات» (Libyan time):
 *     a send that falls inside them is held until they end, and the log says so;
 *   - a device gets at most `perWeek` offer notifications in 7 days (2 unless
 *     the panel changes it): devices over it are skipped and counted;
 *   - «إرسال تجريبي لجهازي» goes only to the signed-in staff member's own
 *     devices, ignores the limit and the quiet hours, and is marked as a test.
 *
 * The log (the last 100 campaigns, newest first) and the weekly limit are
 * stored like the panel's other settings: in Odoo as the system parameter
 * brimatex.app.push (JSON), or without Odoo in this server's own file. An Odoo
 * that refuses the write answers 503, and nothing is sent.
 *
 * Scheduled and held campaigns are sent by a timer in the server process - on
 * boot and every minute (start()). A campaign is marked `sending` with a time
 * and a claim before anything goes out; a second server process skips one
 * claimed in the last 10 minutes, and each device is noted before its message
 * is sent (devices.recordOffers), so a campaign reaches a phone once.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const odoo = require('./odoo');
const push = require('./push');
const devices = require('./devices');
const appSettings = require('./appSettings');

const PARAM = 'brimatex.app.push';
// A test server keeps its own file (like BRIMATEX_SETTINGS_FILE).
const LOCAL_FILE = process.env.BRIMATEX_PUSH_FILE || path.join(__dirname, '..', 'data', 'push.local.json');

const TITLE_MAX = 40;
const BODY_MAX = 120;
const LABEL_MAX = 60;
const CITY_MAX = 40;
const MAX_LOG = 100;
const PER_WEEK_DEFAULT = 2;
const PER_WEEK_MAX = 7;
const WEEK_MS = 7 * 24 * 3600_000;
const CART_MS = 7 * 24 * 3600_000;
const DAY_MS = 24 * 3600_000;
/** Libya is UTC+2 all year. */
const LIBYA_OFFSET_MS = 2 * 3600_000;
/** A `sending` mark older than this belongs to a process that stopped half way - another may take it over. */
const CLAIM_MS = 10 * 60_000;
const MAX_AHEAD_MS = 60 * DAY_MS;
const BATCH = 100;

/** What a tap may open: a mattress, a category, the offers page - or '' (the app). */
const LINK = /^(\/offers|\/mattresses(\/(elite|premium|comfort))?|\/p\/[a-z0-9-]{2,30}|\/product\/\d{1,9})$/;
const AUDIENCES = ['offers', 'city', 'cart'];

class PushError extends Error {
  constructor(message, { status = 400, code = 'invalid', field = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const iso = (ms) => new Date(ms).toISOString();
const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const newId = () => crypto.randomBytes(6).toString('hex');

/* ------------------------------------------------------------- time */

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

/**
 * Whether `nowMs` falls in the quiet hours ({ from, to } as HH:MM, Libyan
 * time; a window may cross midnight), and when the window it is in ends.
 * `to` itself is outside: at 08:00 sharp a held campaign goes.
 */
function quietState(nowMs, quiet) {
  const from = minutesOf(quiet?.from);
  const to = minutesOf(quiet?.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return { inside: false, endsAt: null };
  const local = nowMs + LIBYA_OFFSET_MS;
  const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
  const m = (local - dayStart) / 60_000;
  const inside = from < to ? m >= from && m < to : m >= from || m < to;
  let end = dayStart + to * 60_000 - LIBYA_OFFSET_MS;
  if (end <= nowMs) end += DAY_MS;
  return { inside, endsAt: inside ? end : null };
}

/** «2026-10-05T10:00» (or with seconds), Libyan time → ms, or NaN. */
function parseLibyaTime(value) {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return NaN;
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x || 0));
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return NaN;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s) - LIBYA_OFFSET_MS;
  // 31 February rolls over: refuse it rather than send on 3 March.
  return new Date(ms + LIBYA_OFFSET_MS).getUTCDate() === d ? ms : NaN;
}

/* ------------------------------------------------------------- checks */

const fail = (message, field) => {
  throw new PushError(message, { field });
};

/** The message's words and its link, checked: { title, body, link, linkLabel }. */
function validateMessage(input) {
  if (!isObject(input)) fail('بيانات غير صالحة', null);
  const title = clean(input.title);
  const body = clean(input.body);
  if (!title) fail('اكتب عنوان الإشعار', 'title');
  if (title.length > TITLE_MAX) fail(`العنوان طويل (${TITLE_MAX} حرفاً كحد أقصى)`, 'title');
  if (!body) fail('اكتب نص الإشعار', 'body');
  if (body.length > BODY_MAX) fail(`النص طويل (${BODY_MAX} حرفاً كحد أقصى)`, 'body');
  const link = typeof input.link === 'string' ? input.link.trim() : '';
  if (link && !LINK.test(link)) fail('اختر ما يفتحه الإشعار: مرتبة أو فئة أو صفحة العروض', 'link');
  return { title, body, link, linkLabel: link ? clean(input.linkLabel).slice(0, LABEL_MAX) : '' };
}

/** { kind: 'offers' } · { kind: 'city', city } · { kind: 'cart' }. */
function validateAudience(input) {
  const kind = isObject(input) ? input.kind : null;
  if (kind === 'viewed') throw new PushError('جمهور «من شاهد مرتبة معيّنة» قريباً', { field: 'audience', code: 'soon' });
  if (!AUDIENCES.includes(kind)) fail('اختر الجمهور', 'audience');
  if (kind !== 'city') return { kind };
  const city = clean(input.city);
  if (!city || city.length > CITY_MAX) fail('اختر المدينة', 'audience.city');
  return { kind, city };
}

/** Is this device in the audience? Only devices with «العروض» on ever are. */
function inAudience(device, audience, now = Date.now()) {
  if (!device?.offers) return false;
  if (audience.kind === 'city') return device.city === audience.city;
  if (audience.kind === 'cart') {
    const at = Date.parse(device.cartAt || '');
    return Number.isFinite(at) && now - at <= CART_MS;
  }
  return audience.kind === 'offers';
}

/* ------------------------------------------------------------- the store */

function complete(raw) {
  const doc = isObject(raw) ? raw : {};
  const perWeek = Number(doc.perWeek);
  return {
    perWeek: Number.isInteger(perWeek) && perWeek >= 1 && perWeek <= PER_WEEK_MAX ? perWeek : PER_WEEK_DEFAULT,
    campaigns: Array.isArray(doc.campaigns) ? doc.campaigns.filter((c) => isObject(c) && typeof c.id === 'string') : [],
  };
}

function isAccessError(err) {
  return /AccessError/.test(err?.odooName || '') || /access|not allowed|صلاحي/i.test(err?.message || '');
}

/** Where the log is kept: Odoo's system parameter, or this server's file. */
function storage() {
  return odoo.isConfigured() ? 'odoo' : 'local';
}

/** The log and the limit, straight from the store. Throws when Odoo cannot be read. */
async function load() {
  if (!odoo.isConfigured()) {
    try {
      return complete(JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')));
    } catch {
      return complete(null);
    }
  }
  let raw;
  try {
    raw = await odoo.call('ir.config_parameter', 'get_param', [PARAM]);
  } catch (err) {
    throw new PushError(isAccessError(err) ? 'تعذّرت القراءة من أودو: حساب الربط يحتاج صلاحية الإعدادات' : `تعذّرت القراءة من أودو: ${err.message}`, {
      status: isAccessError(err) ? 503 : 502,
      code: 'odoo',
    });
  }
  if (!raw) return complete(null);
  try {
    return complete(JSON.parse(raw));
  } catch {
    console.error(`[push] ${PARAM} in Odoo is not JSON - starting an empty log`);
    return complete(null);
  }
}

/** Keeps every campaign still to go, and the newest of the rest, up to 100. */
function trim(campaigns) {
  const pending = (c) => ['scheduled', 'held', 'sending'].includes(c.status);
  let room = MAX_LOG - campaigns.filter(pending).length;
  return campaigns.filter((c) => pending(c) || room-- > 0);
}

async function store(doc) {
  const value = { perWeek: doc.perWeek, campaigns: trim(doc.campaigns) };
  if (!odoo.isConfigured()) {
    fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(value, null, 1));
    return;
  }
  try {
    await odoo.call('ir.config_parameter', 'set_param', [PARAM, JSON.stringify(value)]);
  } catch (err) {
    if (isAccessError(err)) throw new PushError('تعذّر الحفظ في أودو: حساب الربط يحتاج صلاحية الإعدادات', { status: 503, code: 'odoo_access' });
    throw new PushError(`تعذّر الحفظ في أودو: ${err.message}`, { status: 502, code: 'odoo' });
  }
}

let chain = Promise.resolve();

/**
 * Reads the log, lets `change` edit it, and stores it - one at a time in this
 * process. `change` returning false stores nothing.
 */
function mutate(change) {
  const run = chain.then(async () => {
    const doc = await load();
    const result = await change(doc);
    if (result !== false) await store(doc);
    return result;
  });
  chain = run.catch(() => {});
  return run;
}

/** A campaign as the panel sees it - without the claim. */
function toPublic(c) {
  const { claim: _claim, ...rest } = c;
  return rest;
}

/* ------------------------------------------------------------- sending */

/** One Expo message: data.link is what the app opens on a tap (src/catalog/links.ts in the app). */
function message(campaign, token, extra = {}) {
  return {
    to: token,
    title: campaign.title,
    body: campaign.body,
    sound: 'default',
    // Android: the app's «العروض» channel (Android falls back to its default without it).
    channelId: 'offers',
    data: { kind: 'offer', link: campaign.link || '', campaignId: campaign.id, ...extra },
  };
}

/** How many offer notifications each device had in the last 7 days, this campaign apart. */
async function weekCounts(campaignId, now) {
  const history = await devices.offerHistory(iso(now - WEEK_MS));
  const counts = new Map();
  const already = new Set();
  for (const h of history) {
    if (h.campaignId === campaignId) already.add(h.token);
    else counts.set(h.token, (counts.get(h.token) || 0) + 1);
  }
  return { counts, already };
}

async function dropDead(tokens) {
  await Promise.all(tokens.map((t) => devices.remove(t).catch(() => {})));
}

/**
 * Sends a campaign to its audience now: devices over the weekly limit are
 * skipped; each device is noted before its message goes. Returns the counts.
 */
async function deliver(campaign, perWeek, now) {
  const targets = (await devices.listAll()).filter((d) => inAudience(d, campaign.audience, now));
  const { counts, already } = await weekCounts(campaign.id, now);
  const eligible = [];
  let skipped = 0;
  for (const d of targets) {
    if (already.has(d.token)) continue; // an earlier attempt sent it
    if ((counts.get(d.token) || 0) >= perWeek) skipped++;
    else eligible.push(d);
  }
  let sent = targets.filter((d) => already.has(d.token)).length;
  let failed = 0;
  const dead = [];
  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH);
    const claimed = new Set(await devices.recordOffers(batch.map((d) => d.token), campaign.id, iso(now)));
    const go = batch.filter((d) => claimed.has(d.token));
    const tickets = await push.send(go.map((d) => message(campaign, d.token)));
    tickets.forEach((t, j) => {
      if (t?.status === 'ok') sent++;
      else failed++;
      if (push.isDeadToken(t)) dead.push(go[j].token);
    });
  }
  await dropDead(dead);
  return { audience: targets.length, sent, skipped, failed };
}

/** Delivers a claimed campaign and writes the outcome to the log. */
async function finish(campaign, perWeek, now) {
  let result;
  try {
    result = await deliver(campaign, perWeek, now);
  } catch (err) {
    // The devices could not be read or noted: the next minute tries again.
    console.error(`[push] ${campaign.id} not sent:`, err.message);
    await mutate((doc) => {
      const e = doc.campaigns.find((c) => c.id === campaign.id);
      if (!e || e.claim !== campaign.claim) return false;
      e.status = 'scheduled';
      delete e.claim;
      delete e.sendingAt;
      return true;
    }).catch(() => {});
    throw err;
  }
  const status = result.sent > 0 || result.failed === 0 ? 'sent' : 'failed';
  let saved = null;
  await mutate((doc) => {
    const e = doc.campaigns.find((c) => c.id === campaign.id);
    if (!e) return false;
    Object.assign(e, { status, sentAt: iso(Date.now()), counts: result });
    delete e.claim;
    delete e.sendingAt;
    saved = { ...e };
    return true;
  });
  console.log(`[push] ${campaign.id} «${campaign.title}»: ${result.sent} sent, ${result.skipped} over the limit, ${result.failed} failed (of ${result.audience})`);
  return saved || { ...campaign, status, counts: result };
}

/* ------------------------------------------------------------- the panel */

/** «إرسال» / «جدولة الإشعار»: { title, body, link, linkLabel, audience, when: 'now' | 'schedule', at }. */
async function create(input, user, now = Date.now()) {
  const msg = validateMessage(input);
  const audience = validateAudience(input.audience);
  const scheduled = input.when === 'schedule';
  let requested = now;
  if (scheduled) {
    requested = parseLibyaTime(input.at);
    if (!Number.isFinite(requested)) fail('اختر تاريخ الإرسال ووقته', 'at');
    if (requested < now - 60_000) fail('هذا الموعد مضى، اختر موعداً قادماً', 'at');
    if (requested > now + MAX_AHEAD_MS) fail('الموعد بعيد: 60 يوماً كحد أقصى', 'at');
    requested = Math.max(requested, now);
  } else {
    const size = (await devices.listAll()).filter((d) => inAudience(d, audience, now)).length;
    if (!size) throw new PushError('لا توجد أجهزة في هذا الجمهور الآن', { status: 409, code: 'empty', field: 'audience' });
  }

  const { quietHours } = await appSettings.current();
  const quiet = quietState(requested, quietHours);
  const campaign = {
    id: newId(),
    ...msg,
    audience,
    test: false,
    status: quiet.inside ? 'held' : scheduled ? 'scheduled' : 'sending',
    requestedAt: iso(requested),
    sendAt: iso(quiet.inside ? quiet.endsAt : requested),
    createdAt: iso(now),
    by: { id: user.id, name: user.name || user.phone || '' },
    counts: null,
  };
  if (campaign.status === 'sending') {
    campaign.sendingAt = iso(now);
    campaign.claim = newId();
  }
  const perWeek = await mutate((doc) => {
    doc.campaigns.unshift(campaign);
    return doc.perWeek;
  });
  if (campaign.status !== 'sending') return toPublic(campaign);
  try {
    return toPublic(await finish(campaign, perWeek, now));
  } catch {
    // Logged and put back as due: the timer sends it within a minute.
    return toPublic({ ...campaign, status: 'scheduled' });
  }
}

/** «إرسال تجريبي لجهازي»: the staff member's own devices only - no limit, no quiet hours, marked as a test. */
async function sendTest(input, user, now = Date.now()) {
  const msg = validateMessage(input);
  const mine = await devices.findForUser(user.id);
  if (!mine.length) {
    throw new PushError('لا يوجد جهاز مسجّل لحسابك: افتح التطبيق وادخل بحسابك نفسه، وفعّل الإشعارات، ثم أعد المحاولة', {
      status: 409,
      code: 'no_device',
    });
  }
  const campaign = {
    id: newId(),
    ...msg,
    audience: { kind: 'test' },
    test: true,
    status: 'sending',
    requestedAt: iso(now),
    sendAt: iso(now),
    sendingAt: iso(now),
    createdAt: iso(now),
    by: { id: user.id, name: user.name || user.phone || '' },
    counts: null,
  };
  // Logged first: an Odoo that refuses the log refuses the send.
  await mutate((doc) => {
    doc.campaigns.unshift(campaign);
  });
  const tickets = await push.send(mine.map((d) => message(campaign, d.token, { test: true })));
  const sent = tickets.filter((t) => t?.status === 'ok').length;
  const counts = { audience: mine.length, sent, skipped: 0, failed: mine.length - sent };
  await dropDead(mine.filter((d, i) => push.isDeadToken(tickets[i])).map((d) => d.token));
  let saved = { ...campaign, status: sent ? 'sent' : 'failed', sentAt: iso(Date.now()), counts };
  delete saved.sendingAt;
  await mutate((doc) => {
    const e = doc.campaigns.find((c) => c.id === campaign.id);
    if (!e) return false;
    Object.assign(e, saved);
    delete e.sendingAt;
    saved = { ...e };
    return true;
  });
  return toPublic(saved);
}

/** Cancels a campaign that has not gone yet (scheduled or held). */
async function cancel(id, user, now = Date.now()) {
  let out = null;
  await mutate((doc) => {
    const e = doc.campaigns.find((c) => c.id === id);
    if (!e) throw new PushError('الإشعار غير موجود', { status: 404, code: 'missing' });
    if (!['scheduled', 'held'].includes(e.status)) {
      throw new PushError(e.status === 'cancelled' ? 'الإشعار ملغى بالفعل' : 'لا يمكن إلغاء إشعار أُرسل أو يُرسَل الآن', { status: 409, code: 'state' });
    }
    Object.assign(e, { status: 'cancelled', cancelledAt: iso(now), cancelledBy: { id: user.id, name: user.name || user.phone || '' } });
    out = { ...e };
  });
  return toPublic(out);
}

/** The weekly limit per device, 1 to 7. */
async function setLimit(value) {
  const perWeek = Number(value);
  if (!Number.isInteger(perWeek) || perWeek < 1 || perWeek > PER_WEEK_MAX) fail(`الحد الأسبوعي من 1 إلى ${PER_WEEK_MAX}`, 'perWeek');
  await mutate((doc) => {
    doc.perWeek = perWeek;
  });
  return perWeek;
}

/**
 * GET /api/panel/push: the log, the limit, the quiet hours, and each audience's
 * size now - devices, and how many of them are at the weekly limit.
 */
async function overview(user, now = Date.now()) {
  const [doc, all, history, mine, settings] = await Promise.all([
    load(),
    devices.listAll(),
    devices.offerHistory(iso(now - WEEK_MS)),
    devices.findForUser(user.id),
    appSettings.current(),
  ]);
  const counts = new Map();
  for (const h of history) counts.set(h.token, (counts.get(h.token) || 0) + 1);
  const tally = (list) => ({ devices: list.length, atLimit: list.filter((d) => (counts.get(d.token) || 0) >= doc.perWeek).length });
  const on = all.filter((d) => d.offers);
  const byCity = new Map();
  for (const d of on) if (d.city) byCity.set(d.city, [...(byCity.get(d.city) || []), d]);
  const quiet = quietState(now, settings.quietHours);
  return {
    campaigns: doc.campaigns.map(toPublic),
    perWeek: doc.perWeek,
    quietHours: { ...settings.quietHours, now: quiet.inside, endsAt: quiet.endsAt ? iso(quiet.endsAt) : null },
    audiences: {
      offers: tally(on),
      cart: tally(on.filter((d) => inAudience(d, { kind: 'cart' }, now))),
      cities: [...byCity.entries()].map(([city, list]) => ({ city, ...tally(list) })).sort((a, b) => b.devices - a.devices || a.city.localeCompare(b.city, 'ar')),
    },
    devices: { total: all.length, offersOff: all.length - on.length },
    myDevices: mine.length,
    storage: storage(),
    service: 'expo',
    limits: { titleMax: TITLE_MAX, bodyMax: BODY_MAX, perWeekMax: PER_WEEK_MAX },
    now: iso(now),
  };
}

/** «آخر إشعار عرض» on the overview: the last campaign that went out (tests left out), or null. */
async function lastSent() {
  const doc = await load();
  const sent = doc.campaigns.filter((c) => !c.test && c.status === 'sent' && c.sentAt);
  if (!sent.length) return null;
  const last = sent.reduce((a, b) => (Date.parse(b.sentAt) > Date.parse(a.sentAt) ? b : a));
  return { id: last.id, title: last.title, body: last.body, audience: last.audience, sentAt: last.sentAt, sent: last.counts?.sent ?? 0 };
}

/* ------------------------------------------------------------- the timer */

const isDue = (now) => (c) =>
  ((c.status === 'scheduled' || c.status === 'held') && Date.parse(c.sendAt) <= now) ||
  (c.status === 'sending' && !c.test && now - Date.parse(c.sendingAt || 0) > CLAIM_MS);

let ticking = false;

/**
 * Sends every campaign whose time has come. A campaign due inside the quiet
 * hours (they were changed after it was scheduled) is held until they end.
 */
async function runDue(now = Date.now()) {
  if (ticking) return [];
  ticking = true;
  const done = [];
  try {
    const due = (await load()).campaigns.filter(isDue(now)).sort((a, b) => Date.parse(a.sendAt) - Date.parse(b.sendAt));
    for (const c of due) {
      const { quietHours } = await appSettings.current();
      const quiet = quietState(now, quietHours);
      const claim = newId();
      let perWeek = PER_WEEK_DEFAULT;
      const outcome = await mutate((doc) => {
        const e = doc.campaigns.find((x) => x.id === c.id);
        if (!e || !isDue(now)(e)) return false;
        perWeek = doc.perWeek;
        if (quiet.inside) {
          Object.assign(e, { status: 'held', sendAt: iso(quiet.endsAt) });
          delete e.claim;
          delete e.sendingAt;
          return 'held';
        }
        Object.assign(e, { status: 'sending', sendingAt: iso(now), claim });
        return 'claimed';
      });
      if (outcome !== 'claimed') continue;
      // Another server process may have claimed it between our read and our write.
      const mine = (await load()).campaigns.find((x) => x.id === c.id);
      if (mine?.claim !== claim) continue;
      try {
        done.push(await finish(mine, perWeek, now));
      } catch {
        /* logged in finish; the next minute tries again */
      }
    }
  } catch (err) {
    console.error('[push] scheduled sends:', err.message);
  } finally {
    ticking = false;
  }
  return done;
}

let timer = null;

/** On boot and every minute (BRIMATEX_PUSH_TICK_MS in tests). */
function start(intervalMs = Number(process.env.BRIMATEX_PUSH_TICK_MS) || 60_000) {
  if (timer) return;
  setTimeout(() => void runDue(), Math.min(5_000, intervalMs)).unref?.();
  timer = setInterval(() => void runDue(), intervalMs);
  timer.unref?.();
}

module.exports = {
  PARAM,
  TITLE_MAX,
  BODY_MAX,
  PER_WEEK_DEFAULT,
  PushError,
  quietState,
  parseLibyaTime,
  validateMessage,
  validateAudience,
  inAudience,
  message,
  storage,
  load,
  overview,
  create,
  sendTest,
  cancel,
  setLimit,
  lastSent,
  runDue,
  start,
};
