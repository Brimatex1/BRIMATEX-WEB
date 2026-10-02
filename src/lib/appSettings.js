/**
 * The apps' and the website's settings - the panel's «الإعدادات»:
 *
 *   minVersion     { ios, android }  the oldest app version still allowed (x.y.z)
 *   forceUpdate    older versions see «حدّث التطبيق» and nothing else
 *   maintenance    { on, message }   ordering stops everywhere and the message shows
 *   guestBrowsing  السماح بالطلب كزائر حتى السلة - off: adding to the cart asks for sign-in
 *   contact        { phone, whatsapp, email, showroom }
 *   quietHours     { from, to }      no offer notifications in between (HH:MM, Libya)
 *
 * Stored in Odoo as the system parameter brimatex.app.settings (JSON), through
 * ir.config_parameter get_param / set_param. Without Odoo (a local or demo
 * server) they live in the server's own settings file (src/lib/settings.js).
 *
 * Read by everyone through GET /api/app/v1/config, so a value is kept in
 * memory for 5 minutes and replaced on every save. The order route reads the
 * same copy: maintenance is enforced here, not only in the clients.
 */
'use strict';

const odoo = require('./odoo');
const settings = require('./settings');

const PARAM = 'brimatex.app.settings';
const CACHE_MS = 5 * 60_000;
/** After a failed read, try Odoo again this soon rather than in 5 minutes. */
const RETRY_MS = 30_000;

const DEFAULT_MAINTENANCE_MESSAGE = 'نجري صيانة قصيرة على المتجر، والطلب متوقف مؤقتاً. نعود قريباً.';

class AppSettingsError extends Error {
  constructor(message, { status = 400, field = null, code = null } = {}) {
    super(message);
    this.status = status;
    this.field = field;
    this.code = code;
  }
}

/** ٠١٢ / ۰۱۲ → 012, as a phone set to Arabic types them. */
function latinDigits(value) {
  return String(value ?? '').replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

/**
 * A Libyan number in its local form, 0XXXXXXXXX - or null. Takes spaces,
 * dashes and the international forms (+218, 00218, 218).
 */
function libyanNumber(value, { mobile = false } = {}) {
  let d = latinDigits(value).replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(d)) return null;
  d = d.replace(/^\+/, '');
  if (d.startsWith('00218')) d = `0${d.slice(5)}`;
  else if (d.startsWith('218')) d = `0${d.slice(3)}`;
  else if (!d.startsWith('0')) d = `0${d}`;
  // Mobiles are 09[1-6]…; landlines 0[2-8]… (021 Tripoli, 061 Benghazi, ...).
  const shape = mobile ? /^09[1-6]\d{7}$/ : /^0(9[1-6]|[2-8]\d)\d{7}$/;
  return shape.test(d) ? d : null;
}

/** Today's behaviour: no forced update, ordering open, guests welcome, the shop's line. */
function defaults() {
  const whatsapp = libyanNumber(settings.readPublicWhatsappSupport().phone, { mobile: true }) || '0935770070';
  return {
    minVersion: { ios: '1.0.0', android: '1.0.0' },
    forceUpdate: false,
    maintenance: { on: false, message: DEFAULT_MAINTENANCE_MESSAGE },
    guestBrowsing: true,
    // The values web/src/shop/contact.ts shows.
    contact: { phone: '0935770070', whatsapp, email: 'info@brimatex.ly', showroom: 'حي الأندلس، طرابلس' },
    quietHours: { from: '22:00', to: '08:00' },
  };
}

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** `base` with `patch` laid over it, one level deep for the grouped keys. */
function overlay(base, patch) {
  const p = isObject(patch) ? patch : {};
  const group = (key) => (isObject(p[key]) ? { ...base[key], ...p[key] } : p[key] === undefined ? base[key] : p[key]);
  return {
    minVersion: group('minVersion'),
    forceUpdate: p.forceUpdate === undefined ? base.forceUpdate : p.forceUpdate,
    maintenance: group('maintenance'),
    guestBrowsing: p.guestBrowsing === undefined ? base.guestBrowsing : p.guestBrowsing,
    contact: group('contact'),
    quietHours: group('quietHours'),
  };
}

const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The settings, checked and in their stored form - or throws an
 * AppSettingsError naming the field («minVersion.ios», «contact.email»...).
 */
function validate(input) {
  const fail = (field, message) => {
    throw new AppSettingsError(message, { field });
  };
  if (!isObject(input)) fail(null, 'بيانات غير صالحة');
  for (const key of ['minVersion', 'maintenance', 'contact', 'quietHours']) {
    if (!isObject(input[key])) fail(key, 'بيانات غير صالحة');
  }

  const minVersion = {};
  for (const platform of ['ios', 'android']) {
    const v = latinDigits(input.minVersion[platform]).trim();
    if (!VERSION.test(v)) fail(`minVersion.${platform}`, 'اكتب الإصدار بالشكل x.y.z، مثل 1.2.0');
    minVersion[platform] = v.split('.').map(Number).join('.');
  }

  if (typeof input.forceUpdate !== 'boolean') fail('forceUpdate', 'قيمة «إجبار التحديث» غير صالحة');
  if (typeof input.guestBrowsing !== 'boolean') fail('guestBrowsing', 'قيمة «السماح بالطلب كزائر» غير صالحة');
  if (typeof input.maintenance.on !== 'boolean') fail('maintenance.on', 'قيمة «وضع الصيانة» غير صالحة');

  const message = typeof input.maintenance.message === 'string' ? input.maintenance.message.replace(/\s+/g, ' ').trim() : '';
  if (input.maintenance.on && !message) fail('maintenance.message', 'اكتب رسالة الصيانة');
  if (message.length > 200) fail('maintenance.message', 'رسالة الصيانة طويلة (200 حرف كحدّ أقصى)');

  const phone = libyanNumber(input.contact.phone);
  if (!phone) fail('contact.phone', 'رقم خدمة العملاء غير صالح، اكتبه مثل 0912345678');
  const whatsapp = libyanNumber(input.contact.whatsapp, { mobile: true });
  if (!whatsapp) fail('contact.whatsapp', 'رقم واتساب غير صالح، اكتب رقم هاتف محمول ليبياً');
  const email = String(input.contact.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 120) fail('contact.email', 'البريد غير صالح');
  const showroom = String(input.contact.showroom ?? '').replace(/\s+/g, ' ').trim();
  if (showroom.length < 2) fail('contact.showroom', 'اكتب عنوان صالة العرض');
  if (showroom.length > 120) fail('contact.showroom', 'عنوان صالة العرض طويل (120 حرفاً كحدّ أقصى)');

  const from = latinDigits(input.quietHours.from).trim();
  const to = latinDigits(input.quietHours.to).trim();
  if (!TIME.test(from)) fail('quietHours.from', 'اكتب الوقت بالشكل 22:00');
  if (!TIME.test(to)) fail('quietHours.to', 'اكتب الوقت بالشكل 08:00');
  if (from === to) fail('quietHours.to', 'بداية ساعات الهدوء ونهايتها متساويتان');

  return {
    minVersion,
    forceUpdate: input.forceUpdate,
    maintenance: { on: input.maintenance.on, message: message || DEFAULT_MAINTENANCE_MESSAGE },
    guestBrowsing: input.guestBrowsing,
    contact: { phone, whatsapp, email, showroom },
    quietHours: { from, to },
  };
}

/**
 * What is stored, made whole: anything missing or no longer valid falls back
 * to its default, field by field, so one bad value never takes the rest down.
 */
function complete(stored) {
  const base = defaults();
  if (!isObject(stored)) return base;
  let result = base;
  const tries = [
    ['minVersion', { minVersion: stored.minVersion }],
    ['forceUpdate', { forceUpdate: stored.forceUpdate }],
    ['maintenance', { maintenance: stored.maintenance }],
    ['guestBrowsing', { guestBrowsing: stored.guestBrowsing }],
    ['contact', { contact: stored.contact }],
    ['quietHours', { quietHours: stored.quietHours }],
  ];
  for (const [, patch] of tries) {
    try {
      result = validate(overlay(result, patch));
    } catch {
      /* this group keeps its default */
    }
  }
  return result;
}

function isAccessError(err) {
  return /AccessError/.test(err?.odooName || '') || /access|not allowed|صلاحي/i.test(err?.message || '');
}

/** Where the settings live on this server: 'odoo' or 'local'. */
function storage() {
  return odoo.isConfigured() ? 'odoo' : 'local';
}

/** The stored settings, completed - straight from the store, no cache. Throws when Odoo cannot be read. */
async function load() {
  if (!odoo.isConfigured()) return complete(settings.readAppSettings());
  let raw;
  try {
    raw = await odoo.call('ir.config_parameter', 'get_param', [PARAM]);
  } catch (err) {
    throw new AppSettingsError(
      isAccessError(err) ? 'تعذّرت القراءة من أودو: حساب الربط يحتاج صلاحية الإعدادات' : `تعذّرت القراءة من أودو: ${err.message}`,
      { status: isAccessError(err) ? 503 : 502, code: 'odoo' }
    );
  }
  if (!raw) return complete(null);
  try {
    return complete(JSON.parse(raw));
  } catch {
    console.error(`[appSettings] ${PARAM} in Odoo is not JSON - the defaults apply`);
    return complete(null);
  }
}

let cache = null; // { value, at }
let pending = null;

/**
 * The settings everyone sees - from memory for 5 minutes. A failed read keeps
 * the last good copy (or the defaults: ordering open) and tries again soon.
 */
async function current(now = Date.now()) {
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  if (!pending) {
    pending = load()
      .then((value) => {
        cache = { value, at: Date.now() };
        return value;
      })
      .catch((err) => {
        console.error('[appSettings]', err.message);
        const value = cache?.value || defaults();
        cache = { value, at: Date.now() - CACHE_MS + RETRY_MS };
        return value;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/**
 * Checks and stores `patch` over the stored settings, and replaces the copy in
 * memory. Odoo refusing (no rights) throws 503 and leaves the old value.
 */
async function save(patch) {
  const before = await load();
  const next = validate(overlay(before, patch));
  if (odoo.isConfigured()) {
    try {
      await odoo.call('ir.config_parameter', 'set_param', [PARAM, JSON.stringify(next)]);
    } catch (err) {
      if (isAccessError(err)) {
        throw new AppSettingsError('تعذّر الحفظ في أودو: حساب الربط يحتاج صلاحية الإعدادات', { status: 503, code: 'odoo_access' });
      }
      throw new AppSettingsError(`تعذّر الحفظ في أودو: ${err.message}`, { status: 502, code: 'odoo' });
    }
  } else {
    settings.writeAppSettings({ ...next, updatedAt: new Date().toISOString() });
  }
  cache = { value: next, at: Date.now() };
  return next;
}

/**
 * GET /api/app/v1/config - public, for the apps and the website. Grows by key:
 * the storefront's home and the quiz join it later. Nothing secret goes in.
 */
function publicConfig(value) {
  return {
    settings: {
      minVersion: { ...value.minVersion },
      forceUpdate: value.forceUpdate,
      maintenance: { on: value.maintenance.on, message: value.maintenance.on ? value.maintenance.message : '' },
      guestBrowsing: value.guestBrowsing,
      contact: { ...value.contact },
      quietHours: { ...value.quietHours },
    },
  };
}

/** Tests only: forget the copy in memory. */
function _resetCache() {
  cache = null;
}

module.exports = {
  PARAM,
  CACHE_MS,
  AppSettingsError,
  defaults,
  validate,
  complete,
  overlay,
  libyanNumber,
  storage,
  load,
  current,
  save,
  publicConfig,
  _resetCache,
};
