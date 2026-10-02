/**
 * The home page's «من إنستغرام بريماتكس» (the 2026 web handoff, WebHome): up
 * to five pictures set from the dashboard, each opening its post on
 * Instagram. Set by hand for now - reading the account's latest posts needs a
 * professional Instagram account linked to the Facebook page, and a token.
 *
 * Kept like the banners (src/lib/banners.js): the list in the settings file,
 * which deploys leave alone, the pictures under src/public/uploads/instagram/;
 * a picture's first bytes must be a real JPEG, PNG or WebP.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');
const { sniff } = require('./avatar');

const DIR = path.join(__dirname, '..', 'public', 'uploads', 'instagram');
const URL_PREFIX = '/uploads/instagram/';

/** The row on the home page holds five. */
const MAX_POSTS = 5;
const MAX_BYTES = 3_000_000;

/** A post's address on Instagram, or null - a picture here opens Instagram and nothing else. */
function cleanLink(value) {
  const link = String(value ?? '').trim();
  if (link.length > 300) return null;
  return /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_\-./?=&%]+$/.test(link) ? link : null;
}

function list() {
  return settings.readInstagram();
}

/** Returns { post } or { error, status }. */
function add(dataUrl, link) {
  const posts = list();
  if (posts.length >= MAX_POSTS) return { status: 400, error: `الحد الأقصى ${MAX_POSTS} صور` };
  const cleaned = cleanLink(link);
  if (!cleaned) return { status: 400, error: 'ضع رابط المنشور على إنستغرام، مثل https://www.instagram.com/p/…' };

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

  const post = { id, imageUrl: URL_PREFIX + filename, link: cleaned };
  settings.writeInstagram([...posts, post]);
  return { post };
}

/** Puts the posts in the given order; ids it does not name keep their place at the end. */
function reorder(ids) {
  if (!Array.isArray(ids)) return { status: 400, error: 'ترتيب غير صالح' };
  const posts = list();
  const rank = (p) => {
    const i = ids.indexOf(p.id);
    return i === -1 ? ids.length + posts.indexOf(p) : i;
  };
  const next = [...posts].sort((a, b) => rank(a) - rank(b));
  settings.writeInstagram(next);
  return { posts: next };
}

/** Deletes a post and its picture. Returns { posts } or { error, status }. */
function remove(id) {
  const posts = list();
  const post = posts.find((p) => p.id === id);
  if (!post) return { status: 404, error: 'الصورة غير موجودة' };
  settings.writeInstagram(posts.filter((p) => p.id !== id));
  const name = path.basename(String(post.imageUrl || ''));
  if (String(post.imageUrl || '').startsWith(URL_PREFIX) && /^[a-f0-9]{16}-[a-f0-9]{16}\.(jpeg|png|webp)$/.test(name)) {
    try {
      fs.unlinkSync(path.join(DIR, name));
    } catch {
      /* already gone */
    }
  }
  return { posts: list() };
}

module.exports = { list, add, reorder, remove, cleanLink, MAX_POSTS };
