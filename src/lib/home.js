/**
 * The storefront's home - the panel's «الواجهة والبانرات»: the banners and the
 * order of the home sections, for the website and both apps.
 *
 *   banners   up to 5 published (drafts beside them), in display order. Each:
 *     id, key          stable names (the key is the banner's slug: deluxe, loyalty...)
 *     status           'published' | 'draft'
 *     tag, title, text the tag line, the title (40 characters at most), one line of text
 *     buttons          1-2 × { label, link } - real links on the website
 *     link             where the whole banner goes (the apps: a tap anywhere)
 *     panel            the text panel's colour (#RRGGBB); the text turns light on a dark one
 *     photo            the website's photo (1600×900); the text is drawn over it as HTML
 *     appImage         the apps' picture (1080×1350), the text baked in
 *     appImages        { ios, android } - the same, cut to each app's banner (optional)
 *     platforms        any of 'ios', 'android', 'web'
 *     startsAt/endsAt  YYYY-MM-DD (Libyan days, both included) or null
 *     tagIcon, card, photoAlt, photoPosition - optional extras (the loyalty
 *                      banner's star and «60 د.ل» card, the photo's alt text and focus)
 *   sections  every home section once, in order, each { key, on }
 *
 * A link is a page of the shop (/p/deluxe, /product/5852, /mattresses/elite,
 * /offers, /account/loyalty...) or an https address.
 *
 * Stored like the settings (src/lib/appSettings.js): Odoo's system parameter
 * brimatex.app.home (JSON) through ir.config_parameter, or the server's own
 * settings file when Odoo is not connected. The pictures are files on this
 * server (src/public/uploads/home/, like the old banners and the Instagram
 * posts) and only their addresses go into the JSON - not Odoo attachments.
 * Until the panel saves a home, the owner's five banners (src/data/home-seed.json,
 * pictures in web/public/images/banners/) are the home.
 *
 * Everyone reads it through GET /api/app/v1/config (publicHome), so it is kept
 * in memory for 5 minutes and replaced on every save.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const odoo = require('./odoo');
const settings = require('./settings');
const { sniff } = require('./avatar');
const { libyaToday } = require('./delivery');
const { isAppPath } = require('./seo');

const PARAM = 'brimatex.app.home';
const CACHE_MS = 5 * 60_000;
const RETRY_MS = 30_000;

const MAX_PUBLISHED = 5;
/** Drafts are kept too, but not without end: the JSON lives in one system parameter. */
const MAX_BANNERS = 12;
const TITLE_MAX = 40;
const TAG_MAX = 40;
const TEXT_MAX = 200;
const LABEL_MAX = 24;
const ALT_MAX = 80;
const CARD_MAX = 48;

const PLATFORMS = ['ios', 'android', 'web'];
const STATUSES = ['published', 'draft'];
const TAG_ICONS = ['points'];

/** The home sections, in the design's order (the panel names them; the clients map the keys to what they have). */
const SECTION_KEYS = ['hero', 'offers', 'categories', 'recent', 'bestsellers', 'quiz', 'instagram'];

const SEED_FILE = path.join(__dirname, '..', 'data', 'home-seed.json');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'home');
const UPLOAD_PREFIX = '/uploads/home/';
/** A picture compressed in the browser is well under this. */
const MAX_IMAGE_BYTES = 3_000_000;
/** The smallest picture that still looks sharp where it is shown. */
const MIN_WIDTH = { photo: 1200, app: 720 };

class HomeError extends Error {
  constructor(message, { status = 400, field = null, banner = null, code = null } = {}) {
    super(message);
    this.status = status;
    this.field = field;
    /** The banner's id when the error is about one banner. */
    this.banner = banner;
    this.code = code;
  }
}

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const oneLine = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

function readSeed() {
  try {
    const raw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    return Array.isArray(raw.banners) ? raw.banners : [];
  } catch (err) {
    console.error('[home] could not read home-seed.json:', err.message);
    return [];
  }
}

function defaultSections() {
  return SECTION_KEYS.map((key) => ({ key, on: true }));
}

/** The home before the panel saves one: the owner's five banners, every section on. */
function defaults() {
  return complete({ banners: readSeed(), sections: defaultSections() });
}

/**
 * A link a banner may carry, cleaned - or null. A page of the shop (the paths
 * the storefront answers, a product by id, a marketing /p/<slug>) or https.
 */
function cleanLink(value) {
  const link = String(value ?? '').trim();
  if (!link || link.length > 300) return null;
  if (/^https:\/\//i.test(link)) {
    try {
      const u = new URL(link);
      return u.protocol === 'https:' && u.hostname.includes('.') && !/\s/.test(link) ? u.toString() : null;
    } catch {
      return null;
    }
  }
  if (!/^\/(?!\/)[A-Za-z0-9\-._~/?=&%]*$/.test(link)) return null;
  const pathname = link.split('?')[0].replace(/\/+$/, '') || '/';
  if (isAppPath(pathname) || /^\/product\/\d+$/.test(pathname) || /^\/p\/[a-z0-9-]{1,40}$/.test(pathname)) return link;
  return null;
}

/** What kind of page a link opens - the panel's «يفتح». */
function linkKind(link) {
  const l = String(link || '');
  if (/^\/(p|product)\//.test(l)) return 'product';
  if (/^\/mattresses(\/|$|\?)/.test(l)) return 'category';
  if (/^\/offers(\?|$)/.test(l)) return 'offer';
  return 'url';
}

const IMAGE_URL = /^\/(uploads\/home|images\/banners)\/[A-Za-z0-9._-]{1,80}\.(jpe?g|png|webp)$/;

function cleanImage(value) {
  const url = String(value ?? '').trim();
  return IMAGE_URL.test(url) ? url : null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = String(value).trim();
  if (!DATE.test(d)) return undefined;
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d ? d : undefined;
}

/**
 * One banner, checked and in its stored form - or throws a HomeError naming
 * the field and the banner. `before` is the stored banner with the same id:
 * a title already stored is kept even if it is over the limit (the owner's
 * loyalty banner is 45 characters; it is kept as designed).
 */
function validateBanner(input, before) {
  if (!isObject(input)) throw new HomeError('بيانات البانر غير صالحة');
  const id = String(input.id ?? '').trim() || crypto.randomBytes(6).toString('hex');
  const fail = (field, message) => {
    throw new HomeError(message, { field, banner: id });
  };
  if (!/^[a-z0-9-]{1,40}$/.test(id)) fail('id', 'معرّف البانر غير صالح');
  const key = String(input.key ?? '').trim() || id;
  if (!/^[a-z0-9-]{1,40}$/.test(key)) fail('key', 'اسم البانر المختصر غير صالح (حروف لاتينية صغيرة وأرقام)');

  const status = STATUSES.includes(input.status) ? input.status : fail('status', 'حالة البانر غير صالحة');

  const title = oneLine(input.title);
  if (!title) fail('title', 'اكتب عنوان البانر');
  if ([...title].length > TITLE_MAX && !(before && before.title === title)) fail('title', `العنوان طويل (${TITLE_MAX} حرفاً كحدّ أقصى)`);
  const tag = oneLine(input.tag);
  if ([...tag].length > TAG_MAX) fail('tag', `السطر فوق العنوان طويل (${TAG_MAX} حرفاً كحدّ أقصى)`);
  const text = oneLine(input.text);
  if ([...text].length > TEXT_MAX) fail('text', `السطر الوصفي طويل (${TEXT_MAX} حرف كحدّ أقصى)`);

  if (!Array.isArray(input.buttons) || input.buttons.length < 1 || input.buttons.length > 2) fail('buttons', 'للبانر زر واحد أو زران');
  const buttons = input.buttons.map((b, i) => {
    const label = oneLine(b?.label);
    if (!label) fail(`buttons.${i}.label`, 'اكتب نص الزر');
    if ([...label].length > LABEL_MAX) fail(`buttons.${i}.label`, `نص الزر طويل (${LABEL_MAX} حرفاً كحدّ أقصى)`);
    const link = cleanLink(b?.link);
    if (!link) fail(`buttons.${i}.link`, 'رابط الزر غير صالح: صفحة في المتجر مثل /mattresses/elite أو رابط https');
    return { label, link };
  });

  const link = input.link ? cleanLink(input.link) : buttons[0].link;
  if (!link) fail('link', 'رابط البانر غير صالح: صفحة في المتجر مثل /p/balance أو رابط https');

  const panel = String(input.panel ?? '').trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(panel)) fail('panel', 'لون الخلفية غير صالح');

  if (!Array.isArray(input.platforms)) fail('platforms', 'اختر أين يظهر البانر');
  const platforms = PLATFORMS.filter((p) => input.platforms.includes(p));
  if (!platforms.length) fail('platforms', 'اختر منصة واحدة على الأقل');

  const photo = input.photo ? cleanImage(input.photo) : null;
  if (input.photo && !photo) fail('photo', 'صورة الموقع غير صالحة');
  if (platforms.includes('web') && !photo) fail('photo', 'أضف صورة الموقع (1600×900)');
  const appImage = input.appImage ? cleanImage(input.appImage) : null;
  if (input.appImage && !appImage) fail('appImage', 'صورة التطبيق غير صالحة');
  if ((platforms.includes('ios') || platforms.includes('android')) && !appImage) fail('appImage', 'أضف صورة التطبيق (1080×1350)');
  const appImages = {};
  if (isObject(input.appImages)) {
    for (const p of ['ios', 'android']) {
      if (!input.appImages[p]) continue;
      const url = cleanImage(input.appImages[p]);
      if (!url) fail('appImage', 'صورة التطبيق غير صالحة');
      appImages[p] = url;
    }
  }

  const startsAt = cleanDate(input.startsAt);
  const endsAt = cleanDate(input.endsAt);
  if (startsAt === undefined) fail('startsAt', 'تاريخ البداية غير صالح');
  if (endsAt === undefined) fail('endsAt', 'تاريخ النهاية غير صالح');
  if (startsAt && endsAt && endsAt < startsAt) fail('endsAt', 'تاريخ النهاية قبل تاريخ البداية');

  const banner = { id, key, status, tag, title, text, buttons, link, panel, photo, appImage, platforms, startsAt, endsAt };
  if (Object.keys(appImages).length) banner.appImages = appImages;

  const photoAlt = oneLine(input.photoAlt);
  if ([...photoAlt].length > ALT_MAX) fail('photoAlt', `وصف الصورة طويل (${ALT_MAX} حرفاً كحدّ أقصى)`);
  if (photoAlt) banner.photoAlt = photoAlt;
  const position = String(input.photoPosition ?? '').trim();
  if (/^\d{1,3}% \d{1,3}%$/.test(position)) banner.photoPosition = position;
  if (TAG_ICONS.includes(input.tagIcon)) banner.tagIcon = input.tagIcon;
  if (isObject(input.card)) {
    const card = {};
    for (const k of ['caption', 'chip', 'value', 'suffix', 'note']) {
      const v = oneLine(input.card[k]);
      if ([...v].length > CARD_MAX) fail(`card.${k}`, 'نص البطاقة طويل');
      if (v) card[k] = v;
    }
    if (card.value) banner.card = card;
  }
  return banner;
}

/** Every known section once, in the given order; one missing joins at the end, switched on. */
function cleanSections(input) {
  const seen = new Set();
  const out = [];
  for (const s of Array.isArray(input) ? input : []) {
    const key = isObject(s) ? s.key : null;
    if (!SECTION_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, on: s.on !== false });
  }
  for (const key of SECTION_KEYS) if (!seen.has(key)) out.push({ key, on: true });
  return out;
}

/**
 * The home, checked and in its stored form - or throws a HomeError. `before`
 * is what is stored now (its titles may stay over the limit, unchanged).
 */
function validate(input, before = null) {
  if (!isObject(input)) throw new HomeError('بيانات غير صالحة');
  if (!Array.isArray(input.banners)) throw new HomeError('بيانات البانرات غير صالحة', { field: 'banners' });
  if (input.banners.length > MAX_BANNERS) throw new HomeError(`الحد الأقصى ${MAX_BANNERS} بانراً بين منشور ومسودة`, { field: 'banners' });
  const previous = new Map((before?.banners || []).map((b) => [b.id, b]));
  const banners = input.banners.map((b) => validateBanner(b, previous.get(String(b?.id ?? ''))));

  const ids = new Set();
  const keys = new Set();
  for (const b of banners) {
    if (ids.has(b.id)) throw new HomeError('بانران بالمعرّف نفسه', { field: 'id', banner: b.id });
    if (keys.has(b.key)) throw new HomeError(`الاسم المختصر «${b.key}» مكرر`, { field: 'key', banner: b.id });
    ids.add(b.id);
    keys.add(b.key);
  }
  const published = banners.filter((b) => b.status === 'published');
  if (published.length > MAX_PUBLISHED) {
    throw new HomeError(`يظهر حتى ${MAX_PUBLISHED} بانرات فقط: احفظ واحداً كمسودة`, { field: 'status', banner: published[MAX_PUBLISHED].id, code: 'max_published' });
  }
  if (input.sections !== undefined && !Array.isArray(input.sections)) throw new HomeError('ترتيب الأقسام غير صالح', { field: 'sections' });
  return { banners, sections: cleanSections(input.sections) };
}

/**
 * What is stored, made whole: a banner that no longer passes is left out (and
 * said), the sections are completed - one bad banner never takes the rest down.
 */
function complete(stored) {
  if (!isObject(stored) || !Array.isArray(stored.banners)) return complete({ banners: readSeed(), sections: stored?.sections });
  const banners = [];
  for (const b of stored.banners.slice(0, MAX_BANNERS)) {
    try {
      // Stored titles were checked when saved: read them as they are.
      const banner = validateBanner(b, b);
      if (!banners.some((x) => x.id === banner.id || x.key === banner.key)) banners.push(banner);
    } catch (err) {
      console.error(`[home] a stored banner (${b?.id}) is not valid and is skipped: ${err.message}`);
    }
  }
  let published = 0;
  for (const b of banners) {
    if (b.status === 'published' && ++published > MAX_PUBLISHED) b.status = 'draft';
  }
  return { banners, sections: cleanSections(stored.sections) };
}

function isAccessError(err) {
  return /AccessError/.test(err?.odooName || '') || /access|not allowed|صلاحي/i.test(err?.message || '');
}

function storage() {
  return odoo.isConfigured() ? 'odoo' : 'local';
}

/** The stored home, completed (the seed until one is saved) - no cache. Throws when Odoo cannot be read. */
async function load() {
  if (!odoo.isConfigured()) {
    const stored = settings.readHome();
    return stored ? complete(stored) : defaults();
  }
  let raw;
  try {
    raw = await odoo.call('ir.config_parameter', 'get_param', [PARAM]);
  } catch (err) {
    throw new HomeError(
      isAccessError(err) ? 'تعذّرت القراءة من أودو: حساب الربط يحتاج صلاحية الإعدادات' : `تعذّرت القراءة من أودو: ${err.message}`,
      { status: isAccessError(err) ? 503 : 502, code: 'odoo' }
    );
  }
  if (!raw) return defaults();
  try {
    return complete(JSON.parse(raw));
  } catch {
    console.error(`[home] ${PARAM} in Odoo is not JSON - the seed applies`);
    return defaults();
  }
}

let cache = null; // { value, at }
let pending = null;

/** The home everyone sees - from memory for 5 minutes; a failed read keeps the last good copy (or the seed). */
async function current(now = Date.now()) {
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  if (!pending) {
    pending = load()
      .then((value) => {
        cache = { value, at: Date.now() };
        return value;
      })
      .catch((err) => {
        console.error('[home]', err.message);
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
 * Checks and stores the whole home, and replaces the copy in memory. Odoo
 * refusing (no rights) throws 503 and leaves the old value.
 */
async function save(input) {
  const before = await load();
  const next = validate(input, before);
  if (odoo.isConfigured()) {
    try {
      await odoo.call('ir.config_parameter', 'set_param', [PARAM, JSON.stringify(next)]);
    } catch (err) {
      if (isAccessError(err)) {
        throw new HomeError('تعذّر الحفظ في أودو: حساب الربط يحتاج صلاحية الإعدادات', { status: 503, code: 'odoo_access' });
      }
      throw new HomeError(`تعذّر الحفظ في أودو: ${err.message}`, { status: 502, code: 'odoo' });
    }
  } else {
    settings.writeHome({ ...next, updatedAt: new Date().toISOString() });
  }
  cache = { value: next, at: Date.now() };
  return next;
}

/** The caller's platform from ?platform= - the website when it does not say. */
function platformOf(value) {
  return PLATFORMS.includes(value) ? value : 'web';
}

/** Published, for this platform, within its dates (Libyan days, both included). */
function isLive(banner, platform, today) {
  return (
    banner.status === 'published' &&
    banner.platforms.includes(platform) &&
    (!banner.startsAt || banner.startsAt <= today) &&
    (!banner.endsAt || banner.endsAt >= today)
  );
}

/**
 * The home in GET /api/app/v1/config: the banners live now for the caller's
 * platform, and the sections. The website gets the text to draw over the
 * photo; an app gets its picture (text baked in) and where a tap goes.
 */
function publicHome(value, platform = 'web', now = new Date()) {
  const today = libyaToday(now);
  const live = value.banners.filter((b) => isLive(b, platform, today)).slice(0, MAX_PUBLISHED);
  const banners = live.map((b) => {
    if (platform === 'web') {
      const out = { id: b.id, key: b.key, tag: b.tag, title: b.title, text: b.text, buttons: b.buttons.map((x) => ({ ...x })), link: b.link, panel: b.panel, photo: b.photo };
      if (b.photoAlt) out.photoAlt = b.photoAlt;
      if (b.photoPosition) out.photoPosition = b.photoPosition;
      if (b.tagIcon) out.tagIcon = b.tagIcon;
      if (b.card) out.card = { ...b.card };
      return out;
    }
    return { id: b.id, key: b.key, title: b.title, link: b.link, image: b.appImages?.[platform] || b.appImage };
  });
  return { banners, sections: value.sections.map((s) => ({ key: s.key, on: s.on })) };
}

/** Width and height from a JPEG, PNG or WebP file's header, or null. */
function imageSize(buffer) {
  try {
    const type = sniff(buffer);
    if (type === 'png') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    if (type === 'webp') {
      const chunk = buffer.toString('ascii', 12, 16);
      if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
      if (chunk === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
      if (chunk === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      return null;
    }
    if (type === 'jpeg') {
      let i = 2;
      while (i + 9 < buffer.length) {
        if (buffer[i] !== 0xff) return null;
        const marker = buffer[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        const length = buffer.readUInt16BE(i + 2);
        // Start of frame: every SOFn except DHT (C4), JPG (C8) and DAC (CC).
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5) };
        }
        i += 2 + length;
      }
    }
  } catch {
    /* a truncated header */
  }
  return null;
}

/**
 * A banner picture from the panel, written under src/public/uploads/home/.
 * `kind` is 'photo' (the website, 1600×900) or 'app' (1080×1350). The type
 * is read from the bytes, never from the data URL. Returns { url, width,
 * height } or { error, status }.
 */
function saveImage(dataUrl, kind) {
  if (!MIN_WIDTH[kind]) return { status: 400, error: 'نوع الصورة غير معروف' };
  const match = /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) return { status: 400, error: 'أرسل الصورة بصيغة JPEG أو PNG أو WebP' };
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) return { status: 413, error: 'حجم الصورة يتجاوز 3 ميجابايت' };
  const type = sniff(buffer);
  if (!type) return { status: 400, error: 'الملف ليس صورة JPEG أو PNG أو WebP' };
  const size = imageSize(buffer);
  if (!size) return { status: 400, error: 'تعذّرت قراءة مقاس الصورة' };
  if (size.width < MIN_WIDTH[kind]) {
    const want = kind === 'photo' ? '1600×900' : '1080×1350';
    return { status: 400, error: `الصورة صغيرة (${size.width}×${size.height}): المقاس المطلوب ${want}` };
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `${kind}-${crypto.randomBytes(8).toString('hex')}.${type === 'jpeg' ? 'jpg' : type}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return { url: UPLOAD_PREFIX + filename, width: size.width, height: size.height };
}

/** Tests only: forget the copy in memory. */
function _resetCache() {
  cache = null;
}

module.exports = {
  PARAM,
  CACHE_MS,
  MAX_PUBLISHED,
  MAX_BANNERS,
  TITLE_MAX,
  SECTION_KEYS,
  PLATFORMS,
  HomeError,
  defaults,
  cleanLink,
  linkKind,
  validate,
  complete,
  storage,
  load,
  current,
  save,
  platformOf,
  publicHome,
  imageSize,
  saveImage,
  _resetCache,
};
