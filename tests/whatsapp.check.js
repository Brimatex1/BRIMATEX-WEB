#!/usr/bin/env node
// The WhatsApp invoice's recipient - src/lib/whatsapp.js:
//  - Libyan numbers in every way a customer types them become +2189xxxxxxxx
//  - the same normalisation as the OTP sender (whatsapp-cloud toInternational)
//  - no number: nothing is sent
//
// Runs in demo mode (no Twilio keys), which reports the number it would send to.
// Runs with the rest: npm test

'use strict';

delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

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

const whatsapp = require('../src/lib/whatsapp');

(async () => {
  // Demo mode logs the whole message; keep the output to the results.
  const log = console.log;
  const send = async (phone) => {
    console.log = () => {};
    try {
      return await whatsapp.sendInvoiceViaWhatsApp(phone, 'INV/2026/0001', 'posted', 1500, 'S00001');
    } finally {
      console.log = log;
    }
  };
  const to = async (phone) => (await send(phone)).phone;

  console.log('\nرقم مستلم فاتورة واتساب (src/lib/whatsapp.js)');
  ok('وضع العرض بلا مفاتيح Twilio', !whatsapp.isConfigured());

  const cases = [
    ['0912345678', 'محلي بصفر'],
    ['912345678', 'محلي بلا صفر'],
    ['218912345678', 'بالمفتاح بلا +'],
    ['+218912345678', 'بالمفتاح مع +'],
    ['00218912345678', 'بالمفتاح مع 00'],
    ['+218 091 234 5678', 'صفر محلي بعد المفتاح ومسافات'],
    ['0912-345-678', 'بشرطات'],
  ];
  for (const [input, label] of cases) {
    const got = await to(input);
    ok(`${label}: ${input} → +218912345678`, got === '+218912345678', got);
  }

  ok('ليبيانا 092 كذلك', (await to('0923456789')) === '+218923456789');
  ok('لا مفتاح السعودية أبداً', !String(await to('0912345678')).includes('966'));

  const none = await send('   ');
  ok('بلا رقم: لا يُرسل شيء', none.sent === false && none.reason === 'no_phone', JSON.stringify(none));

  console.log(`\n\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
  if (fail) {
    console.log('\x1b[31mالفحوص الفاشلة:\x1b[0m\n' + failures.map((f) => '  • ' + f).join('\n'));
    process.exit(1);
  }
})();
