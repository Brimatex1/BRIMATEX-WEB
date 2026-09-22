/**
 * The home page's sliding banners - a few pictures in place of the text
 * announcement, set from the dashboard and shown by the website and the app
 * alike (GET /api/banners).
 *
 * The list lives in the settings file (src/lib/settings.js), which deploys
 * leave alone; the pictures are files under src/public/uploads/banners/, which
 * they leave alone too. As with profile photos, a picture's declared type is
 * not trusted - its first bytes must be a real JPEG, PNG or WebP.
 *
 * A banner may link somewhere in the shop: a path such as /product/5852 or
 * /shop?category=premium, which the app understands too. Nothing outside the
 * shop - a banner is not a way to send customers to another site.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');
const { sniff } = require('./avatar');

const DIR = path.join(__dirname, '..', 'public', 'uploads', 'banners');
const URL_PREFIX = '/uploads/banners/';

/** Three is what the design is for; a little room beyond it, no more. */
const MAX_BANNERS = 5;
/** A wide photo compressed in the browser is well under this. */
const MAX_BYTES = 3_000_000;

/** A path inside the shop, or '' - anything else is refused. */
function cleanLink(value) {
  const link = String(value ?? '').trim();
  if (!link) return '';
  if (link.length > 200 || !/^\/(?!\/)[A-Za-z0-9\-._~/?=&%]*$/.test(link)) return null;
  return link;
}

function list() {
  return settings.readBanners();
}

/** Returns { banner } or { error, status }. */
function add(dataUrl, link) {
  const banners = list();
  if (banners.length >= MAX_BANNERS) return { status: 400, error: `الحد الأقصى ${MAX_BANNERS} صور` };
  const cleaned = cleanLink(link);
  if (cleaned === null) return { status: 400, error: 'الرابط يجب أن يكون داخل المتجر، مثل /shop?category=premium' };

  const match = /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) return { status: 400, error: 'أرسل الصورة بصيغة JPEG أو PNG أو WebP' };
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > MAX_BYTES) return { status: 413, error: 'حجم الصورة يتجاوز 3 ميجابايت' };
  const type = sniff(buffer);
  if (!type) return { status: 400, error: 'الملف ليس صورة JPEG أو PNG أو WebP' };

  fs.mkdirSync(DIR, { recursive: true });
  const id = crypto.randomBytes(8).toString('hex');
  const filename = `${id}-${crypto.randomBytes(8).toString('hex')}.${type}`;
  fs.writeFileSync(path.join(DIR, filename), buffer);

  const banner = { id, imageUrl: URL_PREFIX + filename, link: cleaned };
  settings.writeBanners([...banners, banner]);
  return { banner };
}

/** Changes a banner's link. Returns { banner } or { error, status }. */
function setLink(id, link) {
  const cleaned = cleanLink(link);
  if (cleaned === null) return { status: 400, error: 'الرابط يجب أن يكون داخل المتجر، مثل /shop?category=premium' };
  const banners = list();
  const banner = banners.find((b) => b.id === id);
  if (!banner) return { status: 404, error: 'الصورة غير موجودة' };
  banner.link = cleaned;
  settings.writeBanners(banners);
  return { banner };
}

/** Puts the banners in the given order; ids it does not name keep their place at the end. */
function reorder(ids) {
  if (!Array.isArray(ids)) return { status: 400, error: 'ترتيب غير صالح' };
  const banners = list();
  const rank = (b) => {
    const i = ids.indexOf(b.id);
    return i === -1 ? ids.length + banners.indexOf(b) : i;
  };
  const next = [...banners].sort((a, b) => rank(a) - rank(b));
  settings.writeBanners(next);
  return { banners: next };
}

/** Deletes a banner and its picture. Returns { banners } or { error, status }. */
function remove(id) {
  const banners = list();
  const banner = banners.find((b) => b.id === id);
  if (!banner) return { status: 404, error: 'الصورة غير موجودة' };
  settings.writeBanners(banners.filter((b) => b.id !== id));
  const name = path.basename(String(banner.imageUrl || ''));
  if (String(banner.imageUrl || '').startsWith(URL_PREFIX) && /^[a-f0-9]{16}-[a-f0-9]{16}\.(jpeg|png|webp)$/.test(name)) {
    fs.unlink(path.join(DIR, name), () => {});
  }
  return { banners: list() };
}

module.exports = { list, add, setLink, reorder, remove, cleanLink, MAX_BANNERS };
