/**
 * Profile photos - one per customer, shared by the website and the app.
 *
 * Stored as files under src/public/uploads/avatars/ (served as
 * /uploads/avatars/<file>), beside the dashboard's product images; the deploy
 * leaves that folder alone (scripts/deploy.sh excludes src/public/uploads).
 *
 * The declared type of a data URL is not trusted: the bytes must start the
 * way a real JPEG, PNG or WebP file does, so nothing else can be planted in
 * a public folder under an image name. File names are random - a photo
 * cannot be found by guessing a customer's id - and a new photo replaces the
 * old file.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DIR = path.join(PUBLIC_DIR, 'uploads', 'avatars');
const URL_PREFIX = '/uploads/avatars/';

/** A phone photo, already cropped square, is well under this. */
const MAX_BYTES = 2_000_000;

/** The file's real type from its first bytes, or null. */
function sniff(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * Validates a base64 data URL and writes it. Returns { url } or { error, status }.
 */
function save(dataUrl) {
  const match = /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) return { status: 400, error: 'أرسل الصورة بصيغة JPEG أو PNG أو WebP' };
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > MAX_BYTES) return { status: 413, error: 'حجم الصورة يتجاوز 2 ميجابايت' };
  const type = sniff(buffer);
  if (!type) return { status: 400, error: 'الملف ليس صورة JPEG أو PNG أو WebP' };

  fs.mkdirSync(DIR, { recursive: true });
  const filename = `${crypto.randomBytes(16).toString('hex')}.${type}`;
  fs.writeFileSync(path.join(DIR, filename), buffer);
  return { url: URL_PREFIX + filename };
}

/** Deletes a photo written by save() - never anything outside the avatars folder. */
function remove(url) {
  if (typeof url !== 'string' || !url.startsWith(URL_PREFIX)) return;
  const name = path.basename(url);
  if (!/^[a-f0-9]{32}\.(jpeg|png|webp)$/.test(name)) return;
  fs.unlink(path.join(DIR, name), () => {});
}

module.exports = { save, remove, sniff, MAX_BYTES };
