#!/usr/bin/env node
// Advanced Matching - web/src/lib/pixelMatch.ts against src/lib/meta-capi.js.
//
// What it guards: the browser Pixel and the server's Conversions API hash a
// customer the same way - phone, first and last name, city, country and the
// stable external ID - so Meta sees one person, not two. A drift in either
// normaliser would silently split the customer. Nothing unhashed goes out.
//
// Runs with the rest: npm test (the .ts file is read with Node's type stripping).
const path = require('path');
const { pathToFileURL } = require('url');
const capi = require('../src/lib/meta-capi');

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

const fakeReq = { headers: { 'user-agent': 'test', cookie: '' }, socket: { remoteAddress: '127.0.0.1' } };

function serverUserData(customer, userId) {
  return capi.buildPurchase({ req: fakeReq, orderName: 'S1', customer, items: [], total: 0, userId, tracking: {}, lydPerUsd: null }).user_data;
}

(async () => {
  const { matchData, toInternational } = await import(pathToFileURL(path.join(__dirname, '..', 'web', 'src', 'lib', 'pixelMatch.ts')).href);

  const cases = [
    { label: 'زبون مسجّل', person: { id: 'u_42', name: 'محمد  علي بن سالم', phone: '0912345678', city: 'طرابلس' } },
    { label: 'زائر بلا حساب، رقم دولي', person: { name: 'Sara', phone: '+218 92-123-4567', city: 'بني وليد' } },
    { label: 'اسم واحد، رقم بـ 00218', person: { name: 'أحمد', phone: '00218913334444', city: 'Benghazi.' } },
  ];

  for (const { label, person } of cases) {
    console.log(`\n\x1b[1m${label}\x1b[0m`);
    const web = await matchData(person);
    const srv = serverUserData({ name: person.name, phone: person.phone, city: person.city }, person.id);
    ok('الهاتف: نفس البصمة', web.ph === srv.ph?.[0], `${web.ph} / ${srv.ph}`);
    ok('الاسم الأول: نفس البصمة', web.fn === srv.fn);
    ok('اسم العائلة: نفس البصمة', (web.ln ?? undefined) === (srv.ln ?? undefined));
    ok('المدينة: نفس البصمة', web.ct === srv.ct);
    ok('الدولة: نفس البصمة', web.country === srv.country);
    ok('المعرّف الثابت: نفس البصمة', web.external_id === srv.external_id?.[0]);
    const flat = JSON.stringify(web);
    ok('لا شيء بلا تشفير', !/0912|218|محمد|سالم|طرابلس|sara|أحمد/i.test(flat) && Object.values(web).every((v) => /^[0-9a-f]{64}$/.test(v)), flat.slice(0, 120));
  }

  console.log('\n\x1b[1mالحدود\x1b[0m');
  ok('الرقم الدولي كما على الخادم', ['0912345678', '+218912345678', '00218912345678', '912345678'].every((p) => toInternational(p) === '218912345678'));
  const empty = await matchData({});
  ok('بلا بيانات: الدولة فقط', Object.keys(empty).join() === 'country', JSON.stringify(empty));

  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` + (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : ''));
  failures.forEach((f) => console.log('  • ' + f));
  console.log('─'.repeat(52) + '\n');
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
