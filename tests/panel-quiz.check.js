#!/usr/bin/env node
// The panel's «ساعدني أختار» - /api/panel/quiz (+ /reset) and the `quiz` key of
// /api/app/v1/config.
//
// What it guards:
//   - admin and marketing read, save and reset the rules; support and customers cannot;
//   - until the panel saves, the config carries the factory's rules (src/data/quiz-rules.json);
//   - the server refuses a pair of one mattress, a mattress the rules lack, a question
//     with every answer off - naming the field - and keeps the old rules;
//   - a save reaches the config at once (no 5-minute wait), and a reset brings the
//     factory's back;
//   - with Odoo, the rules are the system parameter brimatex.app.quiz, and an Odoo that
//     refuses the write answers 503 and keeps the old rules.
//
// Runs with the rest: npm test

'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { startTestServer } = require('./_server');

const PORT = Number(process.env.TEST_PORT || 3261);
const ODOO_PORT = PORT + 1;
const FAKE_ODOO_PORT = PORT + 2;
const uniq = () => '09' + Math.floor(10000000 + Math.random() * 89999999);
const FACTORY = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'quiz-rules.json'), 'utf8'));

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } else {
    fail++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log('  \x1b[31m✗\x1b[0m ' + name + (detail ? ' — ' + detail : ''));
  }
}

function req(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: encodeURI(urlPath),
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            /* not JSON */
          }
          resolve({ status: res.statusCode, json, text: raw });
        });
      }
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const bearer = (t) => ({ Authorization: 'Bearer ' + t });
const clone = (v) => JSON.parse(JSON.stringify(v));
const pairOf = (rules, id) => rules?.questions?.find((q) => q.id === 'need')?.options.find((o) => o.id === id)?.pair?.join();

function tempFile(name, content = '{}\n') {
  const file = path.join(os.tmpdir(), `brimatex-${name}-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(file, content);
  return file;
}

async function register(port, name, phone) {
  const r = await req(port, 'POST', '/api/auth/register', { name, phone, password: 'secret123' });
  return { token: r.json?.token, id: r.json?.user?.id, status: r.status };
}

async function localServer() {
  const ADMIN_PHONE = uniq();
  const settingsFile = tempFile('quiz-settings');
  const quizFile = path.join(os.tmpdir(), `brimatex-quiz-${process.pid}-${Date.now()}.json`);
  const { server, out } = await startTestServer({ port: PORT, env: { ADMIN_PHONES: ADMIN_PHONE, BRIMATEX_SETTINGS_FILE: settingsFile, BRIMATEX_QUIZ_FILE: quizFile } });
  const r = (...args) => req(PORT, ...args);
  try {
    console.log('\n\x1b[1m1. القواعد في /api/app/v1/config\x1b[0m');
    const cfg = await r('GET', '/api/app/v1/config');
    ok('بلا دخول ← 200، ومعه quiz', cfg.status === 200 && cfg.json?.quiz?.questions?.length === 3);
    ok('قبل أي حفظ: قواعد المصنع كما هي', JSON.stringify(cfg.json?.quiz?.mattresses) === JSON.stringify(FACTORY.mattresses) && JSON.stringify(cfg.json?.quiz?.questions) === JSON.stringify(FACTORY.questions));
    ok('بلا ملاحظات الملف (source، rules)', cfg.json?.quiz && !('source' in cfg.json.quiz) && !('rules' in cfg.json.quiz) && cfg.json.quiz.first_bonus === 2);

    console.log('\n\x1b[1m2. الصلاحيات: المدير والتسويق نعم، خدمة العملاء لا\x1b[0m');
    const admin = await register(PORT, 'المدير', ADMIN_PHONE);
    const customer = await register(PORT, 'عميل', uniq());
    const marketing = await register(PORT, 'التسويق', uniq());
    const support = await register(PORT, 'خدمة العملاء', uniq());
    ok('الحسابات تُسجَّل', [admin, customer, marketing, support].every((a) => a.status === 201 && a.token));
    await r('PATCH', `/api/panel/users/${marketing.id}/role`, { role: 'marketing' }, bearer(admin.token));
    await r('PATCH', `/api/panel/users/${support.id}/role`, { role: 'support' }, bearer(admin.token));

    ok('بلا رمز ← 401', (await r('GET', '/api/panel/quiz')).status === 401);
    ok('العميل ← 403', (await r('GET', '/api/panel/quiz', null, bearer(customer.token))).status === 403);
    const sp = await r('GET', '/api/panel/quiz', null, bearer(support.token));
    ok('خدمة العملاء ← 403 (section)', sp.status === 403 && sp.json?.code === 'section');
    ok('خدمة العملاء لا تحفظ ← 403', (await r('PUT', '/api/panel/quiz', { rules: FACTORY }, bearer(support.token))).status === 403);
    ok('خدمة العملاء لا تستعيد ← 403', (await r('POST', '/api/panel/quiz/reset', null, bearer(support.token))).status === 403);
    ok('العميل لا يستعيد ← 403', (await r('POST', '/api/panel/quiz/reset', null, bearer(customer.token))).status === 403);
    const mk = await r('GET', '/api/panel/quiz', null, bearer(marketing.token));
    ok('التسويق يقرأ ← 200، والمخزن ملف الخادم', mk.status === 200 && mk.json?.rules?.questions?.length === 3 && mk.json?.storage === 'local', `${mk.status}`);
    ok('المدير يقرأ ← 200', (await r('GET', '/api/panel/quiz', null, bearer(admin.token))).status === 200);

    console.log('\n\x1b[1m3. التحقق في الخادم\x1b[0m');
    const base = mk.json.rules;
    const bad = async (label, mutate, field) => {
      const doc = clone(base);
      mutate(doc);
      const res = await r('PUT', '/api/panel/quiz', { rules: doc }, bearer(marketing.token));
      ok(`${label} ← 400 (${field})`, res.status === 400 && res.json?.field === field, `${res.status} ${JSON.stringify(res.json)}`);
    };
    const need = (d, id) => d.questions[2].options.find((o) => o.id === id);
    await bad('الخيار الأول = البديل', (d) => (need(d, 'back').pair = ['comfort', 'comfort']), 'questions.need.back.pair');
    await bad('مرتبة ليست في القواعد', (d) => (need(d, 'eco').pair = ['classic', 'royal']), 'questions.need.eco.pair');
    await bad('كل إجابات السؤال الأول مطفأة', (d) => d.questions[0].options.forEach((o) => (o.enabled = false)), 'questions.who.options');
    await bad('جملة فارغة', (d) => (d.mattresses.hotel.reasons.high_flex = '  '), 'mattresses.hotel.reasons.high_flex');
    await bad('بلا جملة عامة', (d) => delete d.mattresses.daily.reasons._default, 'mattresses.daily.reasons._default');
    await bad('نص إجابة أطول من 60 حرفاً', (d) => (d.questions[1].options[0].label = 'ع'.repeat(61)), 'questions.position.side.label');
    await bad('عنوان سؤال فارغ', (d) => (d.questions[0].title = ''), 'questions.who.title');
    const junk = await r('PUT', '/api/panel/quiz', null, { ...bearer(marketing.token), 'Content-Type': 'application/json' });
    ok('جسم فارغ ← 400', junk.status === 400);
    ok('لم يتغيّر شيء', pairOf((await r('GET', '/api/app/v1/config')).json?.quiz, 'back') === 'comfort,sport');
    ok('ولا ملف بعد', !fs.existsSync(quizFile));

    console.log('\n\x1b[1m4. الحفظ يصل إلى الإعداد العام فوراً\x1b[0m');
    const doc = clone(base);
    need(doc, 'back').pair = ['sport', 'comfort'];
    need(doc, 'luxury').enabled = false;
    doc.questions[0].options.find((o) => o.id === 'guest').label = 'لغرفة الضيوف';
    doc.mattresses.sport.reasons.back_pain = 'نوابض منفصلة تدعم الظهر.';
    const saved = await r('PUT', '/api/panel/quiz', { rules: doc }, bearer(marketing.token));
    ok('التسويق يحفظ ← 200', saved.status === 200 && pairOf(saved.json?.rules, 'back') === 'sport,comfort', `${saved.status} ${JSON.stringify(saved.json)?.slice(0, 200)}`);
    ok('محفوظ في ملف الخادم', pairOf(JSON.parse(fs.readFileSync(quizFile, 'utf8')), 'back') === 'sport,comfort');
    const after = (await r('GET', '/api/app/v1/config')).json?.quiz;
    ok('الإعداد العام: الزوج الجديد', pairOf(after, 'back') === 'sport,comfort');
    ok('والإجابة المطفأة enabled: false', need(after, 'luxury')?.enabled === false && need(after, 'back')?.enabled === undefined);
    ok('والنص والجملة', after?.questions[0].options.find((o) => o.id === 'guest')?.label === 'لغرفة الضيوف' && after?.mattresses.sport.reasons.back_pain === 'نوابض منفصلة تدعم الظهر.');
    ok('ولكل منصة', pairOf((await r('GET', '/api/app/v1/config?platform=ios')).json?.quiz, 'back') === 'sport,comfort');
    ok('القراءة من اللوحة بعد الحفظ', pairOf((await r('GET', '/api/panel/quiz', null, bearer(admin.token))).json?.rules, 'back') === 'sport,comfort');

    console.log('\n\x1b[1m5. استعادة قواعد المصنع\x1b[0m');
    const reset = await r('POST', '/api/panel/quiz/reset', null, bearer(marketing.token));
    ok('التسويق يستعيد ← 200', reset.status === 200 && pairOf(reset.json?.rules, 'back') === 'comfort,sport');
    const back = (await r('GET', '/api/app/v1/config')).json?.quiz;
    ok('الإعداد العام: قواعد المصنع', JSON.stringify(back?.questions) === JSON.stringify(FACTORY.questions) && JSON.stringify(back?.mattresses) === JSON.stringify(FACTORY.mattresses));

    console.log('\n\x1b[1m6. العنوان\x1b[0m');
    const page = await r('GET', '/admin/quiz');
    ok('/admin/quiz ← 200 الواجهة', page.status === 200 && page.text.includes('<div id="root">'), 'status ' + page.status);
  } catch (err) {
    fail++;
    failures.push('استثناء: ' + err.message);
    console.error(err);
    console.error(out.text);
  } finally {
    server.kill();
    fs.rmSync(settingsFile, { force: true });
    fs.rmSync(quizFile, { force: true });
  }
}

/** Just enough of Odoo's JSON-RPC: login, and ir.config_parameter get_param / set_param. */
function fakeOdoo() {
  const state = { params: {}, setCalls: 0, deny: false };
  const server = http.createServer((rq, rs) => {
    let raw = '';
    rq.on('data', (c) => (raw += c));
    rq.on('end', () => {
      const { id, params } = JSON.parse(raw || '{}');
      const reply = (body) => {
        rs.writeHead(200, { 'Content-Type': 'application/json' });
        rs.end(JSON.stringify({ jsonrpc: '2.0', id, ...body }));
      };
      const error = (name, message) => reply({ error: { code: 200, message: 'Odoo Server Error', data: { name, message } } });
      if (params?.service === 'common' && params.method === 'login') return reply({ result: 7 });
      if (params?.service === 'common') return reply({ result: { server_version: '18.0' } });
      const [, , , model, method, args] = params?.args || [];
      if (model === 'ir.config_parameter' && method === 'get_param') return reply({ result: state.params[args?.[0]] ?? false });
      if (model === 'ir.config_parameter' && method === 'set_param') {
        state.setCalls++;
        if (state.deny) return error('odoo.exceptions.AccessError', "You are not allowed to modify 'System Parameter' (ir.config_parameter) records.");
        state.params[args[0]] = args[1];
        return reply({ result: true });
      }
      return error('odoo.exceptions.UserError', `not in the fake: ${model}.${method}`);
    });
  });
  return new Promise((resolve) => server.listen(FAKE_ODOO_PORT, '127.0.0.1', () => resolve({ server, state })));
}

async function odooServer() {
  const ADMIN_PHONE = uniq();
  const settingsFile = tempFile('quiz-odoo-settings');
  const quizFile = path.join(os.tmpdir(), `brimatex-quiz-odoo-${process.pid}-${Date.now()}.json`);
  const odoo = await fakeOdoo();
  const { server, out } = await startTestServer({
    port: ODOO_PORT,
    env: {
      ADMIN_PHONES: ADMIN_PHONE,
      BRIMATEX_SETTINGS_FILE: settingsFile,
      BRIMATEX_QUIZ_FILE: quizFile,
      ODOO_URL: `http://127.0.0.1:${FAKE_ODOO_PORT}`,
      ODOO_DB: 'test',
      ODOO_USERNAME: 'bot@brimatex.ly',
      ODOO_API_KEY: 'test-key',
    },
  });
  const r = (...args) => req(ODOO_PORT, ...args);
  try {
    console.log('\n\x1b[1m7. مع أودو: المعامل brimatex.app.quiz\x1b[0m');
    const admin = await register(ODOO_PORT, 'المدير', ADMIN_PHONE);
    const got = await r('GET', '/api/panel/quiz', null, bearer(admin.token));
    ok('المخزن: أودو، وقواعد المصنع قبل أول حفظ', got.status === 200 && got.json?.storage === 'odoo' && pairOf(got.json?.rules, 'flex') === 'hotel,crown', `${got.status}`);
    const doc = clone(got.json.rules);
    doc.questions[2].options.find((o) => o.id === 'flex').pair = ['crown', 'hotel'];
    const saved = await r('PUT', '/api/panel/quiz', { rules: doc }, bearer(admin.token));
    ok('الحفظ ← set_param', saved.status === 200 && odoo.state.setCalls === 1, `${saved.status} ${JSON.stringify(saved.json)?.slice(0, 200)}`);
    ok('المعامل JSON بالزوج الجديد', pairOf(JSON.parse(odoo.state.params['brimatex.app.quiz'] || '{}'), 'flex') === 'crown,hotel');
    ok('الإعداد العام فوراً', pairOf((await r('GET', '/api/app/v1/config')).json?.quiz, 'flex') === 'crown,hotel');

    odoo.state.deny = true;
    const before = odoo.state.params['brimatex.app.quiz'];
    doc.questions[2].options.find((o) => o.id === 'flex').pair = ['hotel', 'sport'];
    const denied = await r('PUT', '/api/panel/quiz', { rules: doc }, bearer(admin.token));
    ok('أودو يرفض ← 503 برسالة الصلاحية', denied.status === 503 && denied.json?.error === 'تعذّر الحفظ في أودو: حساب الربط يحتاج صلاحية الإعدادات', `${denied.status} ${JSON.stringify(denied.json)}`);
    ok('الاستعادة أيضاً ← 503', (await r('POST', '/api/panel/quiz/reset', null, bearer(admin.token))).status === 503);
    ok('القيمة القديمة باقية في أودو', odoo.state.params['brimatex.app.quiz'] === before);
    ok('وفي الإعداد العام', pairOf((await r('GET', '/api/app/v1/config')).json?.quiz, 'flex') === 'crown,hotel');
    ok('ولا شيء في ملف الخادم', !fs.existsSync(quizFile));
  } catch (err) {
    fail++;
    failures.push('استثناء: ' + err.message);
    console.error(err);
    console.error(out.text);
  } finally {
    server.kill();
    odoo.server.close();
    fs.rmSync(settingsFile, { force: true });
    fs.rmSync(quizFile, { force: true });
  }
}

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — ساعدني أختار في اللوحة ═══\x1b[0m');
  await localServer();
  await odooServer();

  console.log('\n' + '─'.repeat(52));
  console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
  if (fail) {
    console.log('\x1b[31m' + failures.map((f) => '  - ' + f).join('\n') + '\x1b[0m');
    process.exit(1);
  }
  process.exit(0);
}

run();
