#!/usr/bin/env node
// The visitor's IP - src/lib/clientIp.js:
//  - the first usable address: CF-Connecting-IP, X-Forwarded-For, X-Real-IP, the socket
//  - never a private hop, the loopback, a carrier-internal (100.64/10) or this server's own address
//  - the guard: an address seen with 3 different visitors in a day is no longer sent to Meta
//  - rate limits get a key even when no address is usable
//
// Runs with the rest: npm test

'use strict';

process.env.BRIMATEX_SERVER_IPS = '65.21.80.198, 2a01:4f9::1';

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } else {
    fail++;
    failures.push(name);
    console.log('  \x1b[31m✗\x1b[0m ' + name + (detail ? ' — ' + detail : ''));
  }
}

const ipLib = require('../src/lib/clientIp');
const req = (headers = {}, remoteAddress = '127.0.0.1') => ({ headers, socket: { remoteAddress } });

console.log('\nعنوان الزائر (src/lib/clientIp.js)');
ok('CF-Connecting-IP أولاً', ipLib.clientIp(req({ 'cf-connecting-ip': '41.254.1.2', 'x-forwarded-for': '41.208.1.1' })) === '41.254.1.2');
ok('أول عنوان عام في X-Forwarded-For', ipLib.clientIp(req({ 'x-forwarded-for': '10.0.0.5, 192.168.1.1, 41.208.3.3' })) === '41.208.3.3');
ok('عنوان الخادم نفسه لا يُعدّ عنوان الزائر', ipLib.clientIp(req({ 'x-forwarded-for': '65.21.80.198, 41.208.4.4' })) === '41.208.4.4');
ok('عنوان الخادم بـ IPv6 كذلك', ipLib.clientIp(req({ 'x-forwarded-for': '2a01:4f9::1' })) === undefined);
ok('عنوان داخلي لشركة الاتصالات (100.64/10) لا يُرسل', ipLib.clientIp(req({ 'x-forwarded-for': '100.72.1.1, 41.208.5.5' })) === '41.208.5.5');
ok('100.128 عام', ipLib.clientIp(req({ 'x-forwarded-for': '100.128.0.1' })) === '100.128.0.1');
ok('IPv6 بين قوسين يُقرأ', ipLib.clientIp(req({ 'x-real-ip': '[2a02:1:2::5]' })) === '2a02:1:2::5');
ok('IPv4 خلف IPv6 يُرسل IPv4', ipLib.clientIp(req({}, '::ffff:41.208.9.9')) === '41.208.9.9');
ok('بلا عنوان صالح: لا شيء', ipLib.clientIp(req({})) === undefined && ipLib.clientIp(req({ 'x-forwarded-for': 'junk' }, '::1')) === undefined);
ok('مفتاح حدّ الطلبات موجود دائماً', ipLib.rateKey(req({})) === '127.0.0.1' && ipLib.rateKey({ headers: {} }) === 'unknown' && ipLib.rateKey(req({ 'x-forwarded-for': '41.208.1.1' })) === '41.208.1.1');
const seen = ipLib.explain(req({ 'x-forwarded-for': '10.0.0.1, 41.208.6.6' }));
ok('ما يراه الخادم: العنوان ومصدره والترويسات', seen.ip === '41.208.6.6' && seen.source === 'x-forwarded-for' && seen.headers['x-forwarded-for'] === '10.0.0.1, 41.208.6.6' && seen.headers.socket === '127.0.0.1');

console.log('\nالعنوان المشترك لا يُرسل لميتا');
ipLib._reset();
const at = (h) => req({ 'x-forwarded-for': h, 'user-agent': 'UA' });
ok('زائر أول: عنوانه يُرسل', ipLib.sharedGuard(at('41.208.10.10'), 'v1') === '41.208.10.10');
ok('نفس الزائر مرة ثانية: يُرسل', ipLib.sharedGuard(at('41.208.10.10'), 'v1') === '41.208.10.10');
ok('زائر ثانٍ على العنوان: يُرسل', ipLib.sharedGuard(at('41.208.10.10'), 'v2') === '41.208.10.10');
ok('الزائر الثالث: العنوان مشترك فلا يُرسل', ipLib.sharedGuard(at('41.208.10.10'), 'v3') === undefined);
ok('وبعدها لا يُرسل لأحد عليه', ipLib.sharedGuard(at('41.208.10.10'), 'v1') === undefined);
ok('عنوان آخر لا يتأثر', ipLib.sharedGuard(at('41.208.11.11'), 'v4') === '41.208.11.11');
ok('بلا معرّف زائر: نوع المتصفح يميّز', ipLib.sharedGuard(req({ 'x-forwarded-for': '41.208.12.12', 'user-agent': 'A' })) === '41.208.12.12' && ipLib.sharedGuard(req({ 'x-forwarded-for': '41.208.12.12', 'user-agent': 'A' })) === '41.208.12.12');
ok('بلا عنوان: لا شيء ويُحسب', ipLib.sharedGuard(req({}), 'v5') === undefined);
const day = 24 * 60 * 60_000;
ok('بعد يوم: العنوان يعود صالحاً', ipLib.sharedGuard(at('41.208.10.10'), 'v9', Date.now() + day + 120_000) === '41.208.10.10');

const h = ipLib.health(Date.now() + day + 120_000);
ok('العدّادات للوحة التحكم', h.events === 10 && h.shared === 2 && h.none === 1 && h.sent === 7 && h.sources['x-forwarded-for'] === 9, JSON.stringify(h));
ok('العناوين خلال آخر 24 ساعة', h.addresses === 1 && h.sharedAddresses === 0 && h.sharedVisitors === 3, JSON.stringify(h));

console.log(`\n\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
if (fail) {
  console.log('\x1b[31mالفحوص الفاشلة:\x1b[0m\n' + failures.map((f) => '  • ' + f).join('\n'));
  process.exit(1);
}
