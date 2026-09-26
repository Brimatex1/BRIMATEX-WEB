/**
 * Compression for everything text the server sends - the app's scripts and
 * styles, the HTML shell, JSON, the sitemap and Meta's feed.
 *
 * Nothing in front of the Node app compresses (the host's Apache passes
 * responses through as they are), so the 470 kB script went out whole on
 * every first visit - about 125 kB with brotli. On Libyan mobile networks that
 * is most of the wait before the shop appears.
 *
 * - brotli when the browser offers it (all current ones do), else gzip.
 * - Files under public/ are compressed once and kept in memory by path and
 *   modification time - a deploy replaces the files, so the cache follows
 *   it. A fast pass serves at once while brotli's best runs off the main
 *   thread and takes over; the app's scripts are warmed at start-up.
 * - Replies built per request (HTML, JSON, CSV) use a fast level: they change
 *   every time, and the saving is nearly all there at level 4-6.
 * - Small bodies (under 1 kB) and formats that are already compressed
 *   (images, fonts) go out as they are.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

const MIN_BYTES = 1024;
// TrueType fonts are uncompressed tables (woff2 already is) - they shrink by half.
const TEXT_TYPE = /^(text\/|application\/(javascript|json|xml|manifest\+json)|image\/svg\+xml|font\/(ttf|otf))/;

/** 'br', 'gzip' or null, from the request's Accept-Encoding (a q=0 refuses). */
function encodingFor(req) {
  const header = String(req?.headers?.['accept-encoding'] || '').toLowerCase();
  const offered = new Map();
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().split(';');
    if (!name) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    offered.set(name.trim(), q ? Number(q.slice(2)) : 1);
  }
  const accepts = (name) => (offered.get(name) ?? offered.get('*') ?? 0) > 0;
  if (accepts('br')) return 'br';
  if (accepts('gzip')) return 'gzip';
  return null;
}

function isText(contentType) {
  return TEXT_TYPE.test(String(contentType || ''));
}

function compressSync(body, encoding) {
  return encoding === 'br'
    ? zlib.brotliCompressSync(body, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
        },
      })
    : zlib.gzipSync(body, { level: 6 });
}

/**
 * Sends a reply built for this request, compressed when it is text, big enough
 * and the browser takes it. `headers` must carry the Content-Type.
 */
function sendBody(req, res, status, headers, body) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''), 'utf8');
  const encoding = isText(headers['Content-Type']) && buffer.length >= MIN_BYTES ? encodingFor(req) : null;
  const out = encoding ? compressSync(buffer, encoding) : buffer;
  res.writeHead(status, {
    ...headers,
    ...(isText(headers['Content-Type']) ? { Vary: 'Accept-Encoding' } : {}),
    ...(encoding ? { 'Content-Encoding': encoding } : {}),
    'Content-Length': out.length,
  });
  res.end(req?.method === 'HEAD' ? undefined : out);
}

/** path|mtime|encoding -> Promise<Buffer>. Each file is compressed once per deploy. */
const fileCache = new Map();
const MAX_CACHED_FILES = 200;

/**
 * A file's compressed bytes: at once in a fast pass, while the best pass runs
 * in the background and takes over when done. Brotli's best is ~10% smaller
 * but takes seconds on the main script - the first visitors after a deploy
 * used to wait for it; now they get the fast copy (tens of milliseconds).
 */
function compressedFile(filePath, stat, encoding) {
  const key = `${filePath}|${stat.mtimeMs}|${encoding}`;
  let entry = fileCache.get(key);
  if (!entry) {
    entry = { best: null, fast: null };
    entry.fast = fs.promises.readFile(filePath).then((raw) => {
      const fast = compressSync(raw, encoding);
      const best =
        encoding === 'br'
          ? brotli(raw, {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
              },
            })
          : gzip(raw, { level: zlib.constants.Z_BEST_COMPRESSION });
      best.then((buffer) => (entry.best = buffer)).catch(() => {});
      return fast;
    });
    // A failed read is not cached - the next request tries again.
    entry.fast.catch(() => fileCache.delete(key));
    if (fileCache.size >= MAX_CACHED_FILES) fileCache.delete(fileCache.keys().next().value);
    fileCache.set(key, entry);
  }
  return entry.best ? Promise.resolve(entry.best) : entry.fast;
}

/**
 * Compresses the app's own scripts and styles right after the server starts,
 * so the first visitor after a deploy already finds them ready.
 */
function warm(publicDir) {
  const dir = path.join(publicDir, 'assets');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /\.(js|css)$/.test(f));
  } catch {
    return;
  }
  for (const f of files) {
    const filePath = path.join(dir, f);
    try {
      const stat = fs.statSync(filePath);
      if (stat.size < MIN_BYTES) continue;
      for (const encoding of ['br', 'gzip']) compressedFile(filePath, stat, encoding).catch(() => {});
    } catch {
      /* a file gone since the listing is skipped */
    }
  }
}

/**
 * Sends a file from public/: compressed from the cache when it is text worth
 * compressing, streamed as it is otherwise. `headers` carries its type and
 * caching; the length and encoding are added here.
 */
async function sendFile(req, res, filePath, headers) {
  const stat = await fs.promises.stat(filePath);
  const text = isText(headers['Content-Type']);
  const encoding = text && stat.size >= MIN_BYTES ? encodingFor(req) : null;
  if (encoding) {
    const body = await compressedFile(filePath, stat, encoding);
    res.writeHead(200, { ...headers, Vary: 'Accept-Encoding', 'Content-Encoding': encoding, 'Content-Length': body.length });
    return res.end(req?.method === 'HEAD' ? undefined : body);
  }
  res.writeHead(200, { ...headers, ...(text ? { Vary: 'Accept-Encoding' } : {}), 'Content-Length': stat.size });
  if (req?.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

module.exports = { encodingFor, sendBody, sendFile, warm, isText, MIN_BYTES };
