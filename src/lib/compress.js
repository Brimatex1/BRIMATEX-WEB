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
 * - Files under public/ are compressed once, at brotli's best, off the main
 *   thread, and kept in memory by path and modification time - a deploy
 *   replaces the files, so the cache follows it. Fingerprinted assets are
 *   the same bytes for a year.
 * - Replies built per request (HTML, JSON, CSV) use a fast level: they change
 *   every time, and the saving is nearly all there at level 4-6.
 * - Small bodies (under 1 kB) and formats that are already compressed
 *   (images, fonts) go out as they are.
 */
'use strict';

const fs = require('fs');
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

function compressedFile(filePath, stat, encoding) {
  const key = `${filePath}|${stat.mtimeMs}|${encoding}`;
  let entry = fileCache.get(key);
  if (!entry) {
    entry = fs.promises.readFile(filePath).then((raw) =>
      encoding === 'br'
        ? brotli(raw, {
            params: {
              [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
              [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
            },
          })
        : gzip(raw, { level: zlib.constants.Z_BEST_COMPRESSION })
    );
    // A failed read is not cached - the next request tries again.
    entry.catch(() => fileCache.delete(key));
    if (fileCache.size >= MAX_CACHED_FILES) fileCache.delete(fileCache.keys().next().value);
    fileCache.set(key, entry);
  }
  return entry;
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

module.exports = { encodingFor, sendBody, sendFile, isText, MIN_BYTES };
