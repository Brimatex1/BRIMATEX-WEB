/**
 * The home page's «من إنستغرام بريماتكس», from the account itself: the latest
 * posts of @brimatex.ly through the Instagram API with Instagram Login (a
 * professional account, no Facebook Page, no App Review for one's own account).
 *
 * The admin pastes a token from Meta's App Dashboard into الربط والتكاملات once.
 * It is write-only: saved in the settings file and never sent back. It lasts 60
 * days and is refreshed here long before that.
 *
 * No timers (a hosted process sleeps when idle): GET /api/instagram answers from
 * what is stored at once and, when that is old, refreshes behind the answer. The
 * pictures are copied here because Instagram's addresses expire. Any failure
 * keeps the last good posts on the page and shows in the panel.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');
const { sniff } = require('./avatar');
const { cleanLink, MAX_POSTS } = require('./instagram');
const { getRaw } = require('./http');

/** Only the test servers change this. */
const TEST_API = process.env.BRIMATEX_INSTAGRAM_API || '';
const API = TEST_API || 'https://graph.instagram.com';

const DIR = path.join(__dirname, '..', 'public', 'uploads', 'instagram');
const URL_PREFIX = '/uploads/instagram/';
const AUTO_FILE = /^auto-[a-f0-9]{24}\.(jpeg|png|webp)$/;

const SYNC_EVERY_MS = 3 * 60 * 60 * 1000;
/** After a failure, not again on every visit. */
const RETRY_AFTER_MS = 10 * 60 * 1000;
/** Refreshable once a day old; it dies at 60 days unrefreshed. */
const REFRESH_TOKEN_AFTER_MS = 20 * 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 8_000_000;
const TIMEOUT_MS = 15_000;

let running = null;
let lastAttempt = 0;

/** A readable reason that can never carry the token. */
function failure(message, token) {
  const text = String(message || 'تعذّر الاتصال بإنستغرام');
  return new Error(token ? text.split(token).join('…') : text);
}

async function callApi(pathname, params, token) {
  const url = new URL(pathname, API);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('access_token', token);
  let res;
  try {
    res = await getRaw(url.href, { timeout: TIMEOUT_MS, maxBytes: 2_000_000 });
  } catch {
    throw failure('تعذّر الاتصال بإنستغرام');
  }
  let body = null;
  try {
    body = JSON.parse(res.buffer.toString('utf8'));
  } catch {
    /* not JSON: reported below */
  }
  if (!res.ok || !body || body.error) {
    throw failure(body?.error?.message || `رد إنستغرام برمز ${res.status}`, token);
  }
  return body;
}

/** Instagram's own picture hosts; nothing else is ever fetched from a post's data. */
function allowedImageUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return false;
  }
  if (TEST_API && url.origin === new URL(TEST_API).origin) return true;
  return url.protocol === 'https:' && (url.hostname.endsWith('.cdninstagram.com') || url.hostname.endsWith('.fbcdn.net'));
}

/** Copies a post's picture here once, named from the post's id. Returns its address or null. */
async function keepImage(id, source) {
  if (!allowedImageUrl(source)) return null;
  const stem = `auto-${crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 24)}`;
  fs.mkdirSync(DIR, { recursive: true });
  const existing = fs.readdirSync(DIR).find((name) => name.startsWith(`${stem}.`));
  if (existing) return URL_PREFIX + existing;

  // Every redirect is checked too: a post's data never sends this server elsewhere.
  const res = await getRaw(source, { timeout: TIMEOUT_MS, maxBytes: MAX_IMAGE_BYTES, allow: allowedImageUrl });
  if (!res.ok) return null;
  const { buffer } = res;
  const type = sniff(buffer);
  if (!type) return null;
  const name = `${stem}.${type}`;
  fs.writeFileSync(path.join(DIR, name), buffer);
  return URL_PREFIX + name;
}

/** Deletes the copied pictures no post uses any more. The manual ones are named differently. */
function dropOldImages(posts) {
  const keep = new Set(posts.map((p) => path.basename(p.imageUrl)));
  let names = [];
  try {
    names = fs.readdirSync(DIR);
  } catch {
    return;
  }
  for (const name of names) {
    if (!AUTO_FILE.test(name) || keep.has(name)) continue;
    try {
      fs.unlinkSync(path.join(DIR, name));
    } catch {
      /* already gone */
    }
  }
}

async function refreshTokenIfOld(state) {
  if (Date.now() - Date.parse(state.tokenSavedAt || 0) < REFRESH_TOKEN_AFTER_MS) return state.token;
  const { access_token: fresh } = await callApi('/refresh_access_token', { grant_type: 'ig_refresh_token' }, state.token);
  if (!fresh) throw failure('لم يجدّد إنستغرام المفتاح');
  settings.writeInstagramAuto({ ...settings.readInstagramAuto(), token: fresh, tokenSavedAt: new Date().toISOString() });
  return fresh;
}

async function pull() {
  const state = settings.readInstagramAuto();
  if (!state.token) return;
  try {
    const token = await refreshTokenIfOld(state);
    const { data } = await callApi(
      '/me/media',
      { fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp', limit: '12' },
      token
    );
    const posts = [];
    for (const item of Array.isArray(data) ? data : []) {
      if (posts.length >= MAX_POSTS) break;
      const link = cleanLink(item.permalink);
      // A video's own address is the film; its thumbnail is the picture.
      const source = item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url;
      if (!link || !source) continue;
      const imageUrl = await keepImage(item.id, source).catch(() => null);
      if (imageUrl) posts.push({ id: `ig-${item.id}`, imageUrl, link });
    }
    const now = new Date().toISOString();
    if (!posts.length) {
      settings.writeInstagramAuto({ ...settings.readInstagramAuto(), lastError: { at: now, message: 'لم نجد منشورات صالحة في الحساب' } });
      return;
    }
    settings.writeInstagramAuto({ ...settings.readInstagramAuto(), posts, syncedAt: now, lastError: null });
    dropOldImages(posts);
  } catch (err) {
    console.error('[Instagram]', err.message);
    settings.writeInstagramAuto({
      ...settings.readInstagramAuto(),
      lastError: { at: new Date().toISOString(), message: err.message },
    });
  }
}

/** One at a time: concurrent visits share the same run. */
function sync() {
  if (!running) {
    lastAttempt = Date.now();
    running = pull().finally(() => {
      running = null;
    });
  }
  return running;
}

/** Called on each read of the posts: refreshes behind the answer when they are old. */
function refreshIfOld() {
  const { token, syncedAt } = settings.readInstagramAuto();
  if (!token || running) return;
  if (Date.now() - lastAttempt < RETRY_AFTER_MS) return;
  if (Date.now() - Date.parse(syncedAt || 0) < SYNC_EVERY_MS) return;
  void sync();
}

/** The account's posts while connected and any were fetched; otherwise none (the caller's manual ones). */
function posts() {
  const state = settings.readInstagramAuto();
  return state.token && Array.isArray(state.posts) ? state.posts : [];
}

/** What the panel may know: never the token, only its last four characters. */
function status() {
  const state = settings.readInstagramAuto();
  return {
    connected: Boolean(state.token),
    username: state.username || null,
    tokenLast4: state.token ? state.token.slice(-4) : null,
    syncedAt: state.syncedAt || null,
    count: Array.isArray(state.posts) ? state.posts.length : 0,
    lastError: state.lastError || null,
  };
}

/** Checks the token against the account, saves it and fetches the posts. Returns { status } or { error, code }. */
async function connect(rawToken) {
  const token = String(rawToken || '').trim();
  if (token.length < 20 || token.length > 1000 || /\s/.test(token)) return { code: 400, error: 'المفتاح غير صالح' };
  let me;
  try {
    me = await callApi('/me', { fields: 'id,username,account_type' }, token);
  } catch (err) {
    return { code: 400, error: `رفض إنستغرام المفتاح: ${err.message}` };
  }
  settings.writeInstagramAuto({
    ...settings.readInstagramAuto(),
    token,
    tokenSavedAt: new Date().toISOString(),
    username: me.username || null,
    lastError: null,
  });
  await sync();
  return { status: status() };
}

/** Forgets the token and the copied pictures: the manual posts, if any, show again. */
function disconnect() {
  settings.writeInstagramAuto(null);
  dropOldImages([]);
  return status();
}

module.exports = { connect, disconnect, sync, refreshIfOld, posts, status };
