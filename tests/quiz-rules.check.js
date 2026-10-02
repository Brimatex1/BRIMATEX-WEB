#!/usr/bin/env node
// «ساعدني أختار» rules - src/lib/quizRules.js:
//  - the factory's rules (src/data/quiz-rules.json) are valid as they ship
//  - a pair must name two different mattresses that exist; an answer can be
//    turned off but not every answer of a question; wording has limits
//  - without Odoo: saved to a local file and read back; with Odoo: the system
//    parameter brimatex.app.quiz, and a refused write keeps the old rules (503)
//
// Runs with the rest: npm test

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

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
const throwsWith = (fn, re) => {
  try {
    fn();
    return false;
  } catch (err) {
    return re.test(err.message) && err.status === 400;
  }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-'));
process.env.BRIMATEX_QUIZ_FILE = path.join(tmp, 'quiz.local.json');

// A fake Odoo the module talks to (switched on for the second half).
let odooOn = false;
let stored = null;
let refuse = false;
const fakeOdoo = {
  isConfigured: () => odooOn,
  async call(model, method, args) {
    if (model !== 'ir.config_parameter') throw new Error('unexpected ' + model);
    if (method === 'get_param') return stored;
    if (method === 'set_param') {
      if (refuse) {
        const err = new Error('You are not allowed to modify this record');
        err.odooName = 'odoo.exceptions.AccessError';
        throw err;
      }
      stored = args[1];
      return true;
    }
    throw new Error('unexpected ' + method);
  },
};
require.cache[path.resolve(__dirname, '../src/lib/odoo.js')] = { id: 'odoo', filename: 'odoo', loaded: true, exports: fakeOdoo };
const quiz = require('../src/lib/quizRules');

(async () => {
  console.log('\nقواعد «ساعدني أختار» (src/lib/quizRules.js)');

  const factory = quiz.defaults();
  let clean;
  try {
    clean = quiz.validate(factory);
  } catch (err) {
    clean = null;
    console.log(err.message);
  }
  ok('قواعد المصنع صالحة كما هي', Boolean(clean));
  ok('ثلاثة أسئلة وثماني إجابات للثالث', clean?.questions.length === 3 && clean.questions[2].options.length === 8);
  ok('الأزواج كما هي: آلام الظهر = كمفورت ثم سبورت', JSON.stringify(clean?.questions[2].options[0].pair) === '["comfort","sport"]');
  ok('أفضلية الاختيار الأول 2', clean?.first_bonus === 2);

  const withPair = (pair) => {
    const r = quiz.defaults();
    r.questions[2].options[0].pair = pair;
    return r;
  };
  ok('زوج بمرتبة واحدة مرتين: مرفوض', throwsWith(() => quiz.validate(withPair(['comfort', 'comfort'])), /يجب أن يختلفا/));
  ok('مرتبة غير موجودة: مرفوضة', throwsWith(() => quiz.validate(withPair(['comfort', 'nope'])), /غير موجودة/));
  const offAll = quiz.defaults();
  offAll.questions[0].options.forEach((o) => (o.enabled = false));
  ok('إطفاء كل إجابات سؤال: مرفوض', throwsWith(() => quiz.validate(offAll), /إجابة مفعّلة/));
  const offOne = quiz.defaults();
  offOne.questions[2].options[7].enabled = false;
  ok('إطفاء إجابة واحدة: مقبول ومحفوظ', quiz.validate(offOne).questions[2].options[7].enabled === false);
  const noLabel = quiz.defaults();
  noLabel.questions[1].options[0].label = '  ';
  ok('نص إجابة فارغ: مرفوض', throwsWith(() => quiz.validate(noLabel), /نص الإجابة/));
  const badSupport = quiz.defaults();
  badSupport.mattresses.classic.support = 5;
  ok('مستوى دعم خارج 0-3: مرفوض', throwsWith(() => quiz.validate(badSupport), /من 0 إلى 3/));
  const noDefault = quiz.defaults();
  delete noDefault.mattresses.daily.reasons._default;
  ok('بدون الجملة العامة: مرفوض', throwsWith(() => quiz.validate(noDefault), /العامة/));
  const reordered = quiz.defaults();
  reordered.questions.reverse();
  ok('ترتيب الأسئلة ثابت', throwsWith(() => quiz.validate(reordered), /الأسئلة الثلاثة/));

  // Without Odoo: a local file.
  quiz._resetCache();
  ok('بلا شيء محفوظ: قواعد المصنع', JSON.stringify((await quiz.load()).questions[2].options[3].pair) === '["sport","deluxe"]');
  const edited = quiz.defaults();
  edited.questions[2].options[3].pair = ['deluxe', 'sport'];
  edited.mattresses.sport.reasons._default = 'جملة معدّلة للتجربة.';
  await quiz.save(edited);
  quiz._resetCache();
  const back = await quiz.load();
  ok('الحفظ المحلي يُقرأ كما حُفظ', JSON.stringify(back.questions[2].options[3].pair) === '["deluxe","sport"]' && back.mattresses.sport.reasons._default === 'جملة معدّلة للتجربة.');
  ok('والملف المحلي في المكان المحدد', fs.existsSync(process.env.BRIMATEX_QUIZ_FILE));
  await quiz.reset();
  quiz._resetCache();
  ok('«استعادة قواعد المصنع»', JSON.stringify((await quiz.load()).questions[2].options[3].pair) === '["sport","deluxe"]');

  // With Odoo: the system parameter.
  odooOn = true;
  quiz._resetCache();
  ok('أودو بلا معامل محفوظ: قواعد المصنع', (await quiz.load()).questions.length === 3);
  await quiz.save(edited);
  ok('الحفظ في معامل النظام brimatex.app.quiz', JSON.parse(stored).questions[2].options[3].pair[0] === 'deluxe');
  refuse = true;
  let refused = null;
  try {
    await quiz.save(quiz.defaults());
  } catch (err) {
    refused = err;
  }
  ok('أودو يرفض الكتابة: 503 برسالة الصلاحية', refused?.status === 503 && /صلاحية الإعدادات/.test(refused.message));
  ok('والقواعد القديمة باقية', JSON.parse(stored).questions[2].options[3].pair[0] === 'deluxe');
  stored = '{not json';
  quiz._resetCache();
  ok('معامل تالف في أودو: قواعد المصنع بدل التوقف', JSON.stringify((await quiz.load()).questions[2].options[3].pair) === '["sport","deluxe"]');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
  if (fail) {
    console.log('\x1b[31mالفحوص الفاشلة:\x1b[0m\n' + failures.map((f) => '  • ' + f).join('\n'));
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
