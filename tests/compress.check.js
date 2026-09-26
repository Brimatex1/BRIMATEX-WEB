#!/usr/bin/env node
// Compression - src/lib/compress.js, end to end on a real server.
//
// What it guards: the site's text goes out compressed - brotli when the
// browser offers it, gzip otherwise, as it is when neither - and what arrives
// decompresses to the very bytes on disk. Images and fonts already compressed
// are left alone, and HEAD answers carry no body. Nothing in front of the Node
// app compresses, so this is the only thing that does.
//
// Runs with the rest: npm test
const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const { startTestServer } = require('./_server');
const { encodingFor } = require('../src/lib/compress');

const PORT = 3291;
let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function get(p, acceptEncoding, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path: p, method, headers: acceptEncoding ? { 'Accept-Encoding': acceptEncoding } : {} },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function decoded(res) {
  const enc = res.headers['content-encoding'];
  if (enc === 'br') return zlib.brotliDecompressSync(res.body);
  if (enc === 'gzip') return zlib.gunzipSync(res.body);
  return res.body;
}

(async () => {
  console.log('\n\x1b[1m1. ما يقبله المتصفح\x1b[0m');
  const req = (h) => ({ headers: { 'accept-encoding': h } });
  ok('brotli أولاً', encodingFor(req('gzip, deflate, br')) === 'br');
  ok('gzip حين لا brotli', encodingFor(req('gzip, deflate')) === 'gzip');
  ok('q=0 رفض', encodingFor(req('br;q=0, gzip')) === 'gzip');
  ok('لا شيء', encodingFor(req('')) === null && encodingFor({ headers: {} }) === null);

  const publicDir = path.join(__dirname, '..', 'src', 'public');
  const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const script = indexHtml.match(/\/assets\/index-[^"]+\.js/)?.[0];
  const onDisk = fs.readFileSync(path.join(publicDir, script));
  const image = fs.readdirSync(path.join(publicDir, 'images', 'products'))[0];

  const { server } = await startTestServer({ port: PORT });
  try {
    console.log('\n\x1b[1m2. سكربت الموقع\x1b[0m');
    const br = await get(script, 'gzip, deflate, br');
    ok('brotli', br.status === 200 && br.headers['content-encoding'] === 'br', JSON.stringify(br.headers));
    ok('يُفكّ إلى نفس الملف بالضبط', decoded(br).equals(onDisk));
    ok(`أصغر بكثير (${Math.round(onDisk.length / 1024)} ← ${Math.round(br.body.length / 1024)} ك.ب)`, br.body.length < onDisk.length * 0.4);
    ok('Content-Length صحيح', Number(br.headers['content-length']) === br.body.length);
    ok('Vary: Accept-Encoding', /accept-encoding/i.test(br.headers.vary || ''));
    ok('التخزين لسنة كما كان', /immutable/.test(br.headers['cache-control'] || ''));
    const again = await get(script, 'br');
    ok('المرة الثانية من الذاكرة، نفس البايتات', again.body.equals(br.body));
    const gz = await get(script, 'gzip');
    ok('gzip للمتصفح القديم', gz.headers['content-encoding'] === 'gzip' && decoded(gz).equals(onDisk));
    const plain = await get(script, '');
    ok('بلا ضغط لمن لا يقبله', !plain.headers['content-encoding'] && plain.body.equals(onDisk));
    const head = await get(script, 'br', 'HEAD');
    ok('HEAD: الرؤوس بلا جسم', head.status === 200 && head.headers['content-encoding'] === 'br' && head.body.length === 0);

    console.log('\n\x1b[1m3. الصفحات والبيانات\x1b[0m');
    const page = await get('/', 'br');
    ok('الصفحة الرئيسية مضغوطة', page.headers['content-encoding'] === 'br' && decoded(page).toString('utf8').includes('<div id="root">'), JSON.stringify(page.headers['content-encoding']));
    const products = await get('/api/products', 'gzip');
    ok('الكتالوج JSON مضغوط ويُقرأ', products.headers['content-encoding'] === 'gzip' && Array.isArray(JSON.parse(decoded(products)).products));
    const feed = await get('/feeds/meta-catalog.csv', 'gzip');
    ok('ملف ميتا مضغوط ويُقرأ', feed.status === 200 && decoded(feed).toString('utf8').startsWith('id,'), JSON.stringify(feed.headers['content-encoding']));

    console.log('\n\x1b[1m4. ما لا يُضغط\x1b[0m');
    const img = await get(`/images/products/${image}`, 'br');
    ok('الصورة كما هي', img.status === 200 && !img.headers['content-encoding']);
    const woff2 = await get('/fonts/ibm-plex-sans-arabic-regular.woff2', 'br');
    ok('خط woff2 كما هو', woff2.status === 200 && !woff2.headers['content-encoding']);
    const tiny = await get('/api/pixel-config', 'br');
    ok('ردّ صغير بلا ضغط', !tiny.headers['content-encoding'] && JSON.parse(tiny.body.toString()) !== null);
  } finally {
    server.kill();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` + (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : ''));
  failures.forEach((f) => console.log('  • ' + f));
  console.log('─'.repeat(52) + '\n');
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
