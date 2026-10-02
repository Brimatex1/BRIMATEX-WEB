#!/usr/bin/env node
// POST /api/meta/events (src/routes/metaEvents.js): an event ID already relayed
// is not sent to Meta again - a retried or repeated InitiateCheckout counts once.
// Runs with the rest: npm test
'use strict';

const { _alreadySent } = require('../src/routes/metaEvents');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } else {
    fail++;
    console.log('  \x1b[31m✗\x1b[0m ' + name);
  }
}

console.log('\nأحداث المتصفح إلى ميتا (src/routes/metaEvents.js)');
ok('أول مرة: يُرسل', _alreadySent('InitiateCheckout', 'ic_abc_1790000000000') === false);
ok('نفس المعرّف مرة ثانية: لا يُرسل', _alreadySent('InitiateCheckout', 'ic_abc_1790000000000') === true);
ok('معرّف آخر (سلة تغيّرت): يُرسل', _alreadySent('InitiateCheckout', 'ic_abc_1790000000999') === false);
ok('نفس المعرّف لحدث آخر: حدث مستقل', _alreadySent('AddPaymentInfo', 'ic_abc_1790000000000') === false);
console.log(`\n\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
if (fail) process.exit(1);
