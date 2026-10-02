/**
 * «ساعدني أختار» rules - the factory's pairs, tags and sentences
 * (src/data/quiz-rules.json, from the admin handoff's docs/QUIZ.md) - which the
 * admin panel edits and the website and the apps read through
 * GET /api/app/v1/config, so all three give the same answer.
 *
 * Stored like the panel's settings (src/lib/appSettings.js): with Odoo, the
 * system parameter brimatex.app.quiz (JSON); without it, a local file. Nothing
 * stored yet means the factory's rules.
 *
 * What the panel may change: the pair (first choice and alternative) of each
 * answer to question 3, an answer on or off, the reason sentences, and the
 * question/answer wording. The engine itself (weights, bonus) stays the
 * factory's unless the stored JSON says otherwise.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const odoo = require('./odoo');

const PARAM = 'brimatex.app.quiz';
const CACHE_MS = 5 * 60_000;
const RETRY_MS = 30_000;
// A test server keeps its own file (like BRIMATEX_SETTINGS_FILE).
const LOCAL_FILE = process.env.BRIMATEX_QUIZ_FILE || path.join(__dirname, '..', 'data', 'quiz.local.json');
const FACTORY_FILE = path.join(__dirname, '..', 'data', 'quiz-rules.json');

class QuizRulesError extends Error {
  constructor(message, { status = 400, code = 'invalid', field = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/** The factory's rules, fresh each call (callers may change their copy). */
function defaults() {
  return JSON.parse(fs.readFileSync(FACTORY_FILE, 'utf8'));
}

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
const fail = (message, field) => {
  throw new QuizRulesError(message, { field });
};

/**
 * Checks a whole rules object and returns a clean copy. Every mattress a pair
 * names must exist, and a pair's two mattresses must differ (ADMIN.md).
 */
function validate(input) {
  if (!isObject(input)) fail('القواعد غير صالحة', null);
  const mattresses = {};
  if (!isObject(input.mattresses) || !Object.keys(input.mattresses).length) fail('لا توجد مراتب في القواعد', 'mattresses');
  for (const [key, m] of Object.entries(input.mattresses)) {
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(key) || !isObject(m)) fail(`مرتبة غير صالحة: ${key}`, `mattresses.${key}`);
    if (!text(m.name, 40)) fail(`اسم المرتبة ${key} مطلوب`, `mattresses.${key}.name`);
    const support = Number(m.support);
    if (!Number.isInteger(support) || support < 0 || support > 3) fail(`مستوى الدعم لـ${m.name} من 0 إلى 3`, `mattresses.${key}.support`);
    if (!Array.isArray(m.tags) || m.tags.some((t) => typeof t !== 'string' || !/^[a-z_]{2,40}$/.test(t))) fail(`وسوم ${m.name} غير صالحة`, `mattresses.${key}.tags`);
    if (!isObject(m.reasons) || !text(m.reasons._default, 220)) fail(`جملة ${m.name} العامة مطلوبة`, `mattresses.${key}.reasons._default`);
    const reasons = {};
    for (const [tag, sentence] of Object.entries(m.reasons)) {
      if (!text(sentence, 220)) fail(`جملة «${tag}» لـ${m.name} فارغة أو أطول من 220 حرفاً`, `mattresses.${key}.reasons.${tag}`);
      reasons[tag] = sentence.trim();
    }
    mattresses[key] = { name: m.name.trim(), tier: String(m.tier || ''), tags: [...new Set(m.tags)], support, reasons };
  }

  if (!Array.isArray(input.questions)) fail('الأسئلة مطلوبة', 'questions');
  const ids = input.questions.map((q) => q?.id);
  if (ids.join() !== 'who,position,need') fail('الأسئلة الثلاثة ثابتة: لمن المرتبة، كيف تنام، ما الأهم', 'questions');
  const questions = input.questions.map((q) => {
    if (!text(q.title, 80)) fail('عنوان السؤال مطلوب', `questions.${q.id}.title`);
    if (!Array.isArray(q.options) || q.options.length < 2) fail(`السؤال «${q.title}» يحتاج إجابتين على الأقل`, `questions.${q.id}.options`);
    const seen = new Set();
    const options = q.options.map((o) => {
      if (!isObject(o) || !/^[a-z][a-z0-9_]{1,30}$/.test(o.id || '') || seen.has(o.id)) fail(`إجابة غير صالحة في «${q.title}»`, `questions.${q.id}.options`);
      seen.add(o.id);
      if (!text(o.label, 60)) fail(`نص الإجابة مطلوب (60 حرفاً كحد أقصى)`, `questions.${q.id}.${o.id}.label`);
      const out = { id: o.id, label: o.label.trim() };
      if (o.enabled === false) out.enabled = false;
      if (q.id === 'need') {
        const pair = o.pair;
        if (!Array.isArray(pair) || pair.length !== 2) fail(`«${o.label}» يحتاج مرتبتين`, `questions.need.${o.id}.pair`);
        if (!mattresses[pair[0]] || !mattresses[pair[1]]) fail(`«${o.label}»: المرتبة غير موجودة في القواعد`, `questions.need.${o.id}.pair`);
        if (pair[0] === pair[1]) fail(`«${o.label}»: الاختيار الأول والبديل يجب أن يختلفا`, `questions.need.${o.id}.pair`);
        out.pair = [pair[0], pair[1]];
        out.tag = typeof o.tag === 'string' && o.tag ? o.tag : null;
      } else {
        const weights = {};
        for (const [tag, w] of Object.entries(isObject(o.weights) ? o.weights : {})) {
          if (!/^[a-z_]{2,40}$/.test(tag) || !Number.isFinite(Number(w)) || Math.abs(Number(w)) > 10) fail(`وزن غير صالح في «${o.label}»`, `questions.${q.id}.${o.id}.weights`);
          weights[tag] = Number(w);
        }
        out.weights = weights;
      }
      return out;
    });
    if (!options.some((o) => o.enabled !== false)) fail(`السؤال «${q.title}» يحتاج إجابة مفعّلة واحدة على الأقل`, `questions.${q.id}.options`);
    return { id: q.id, title: q.title.trim(), ...(text(q.subtitle, 160) ? { subtitle: q.subtitle.trim() } : {}), type: 'single', options };
  });

  const bonus = input.first_bonus === undefined ? 2 : Number(input.first_bonus);
  if (!Number.isFinite(bonus) || bonus < 0 || bonus > 10) fail('أفضلية الاختيار الأول من 0 إلى 10', 'first_bonus');
  return { version: Number(input.version) || 3, mattresses, questions, first_bonus: bonus };
}

function isAccessError(err) {
  return /AccessError/.test(err?.odooName || '') || /access|not allowed|صلاحي/i.test(err?.message || '');
}

function readLocal() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/** The stored rules, or the factory's - straight from the store. Throws when Odoo cannot be read. */
async function load() {
  let raw = null;
  if (odoo.isConfigured()) {
    try {
      raw = await odoo.call('ir.config_parameter', 'get_param', [PARAM]);
    } catch (err) {
      throw new QuizRulesError(isAccessError(err) ? 'تعذّرت القراءة من أودو: حساب الربط يحتاج صلاحية الإعدادات' : `تعذّرت القراءة من أودو: ${err.message}`, {
        status: isAccessError(err) ? 503 : 502,
        code: 'odoo',
      });
    }
    if (raw) {
      try {
        return validate(JSON.parse(raw));
      } catch {
        console.error(`[quizRules] ${PARAM} in Odoo is not valid - the factory's rules apply`);
      }
    }
    return defaults();
  }
  const local = readLocal();
  if (local) {
    try {
      return validate(local);
    } catch {
      console.error(`[quizRules] ${LOCAL_FILE} is not valid - the factory's rules apply`);
    }
  }
  return defaults();
}

let cache = null;
let pending = null;

/** The rules everyone reads - from memory for 5 minutes; a failed read keeps the last good copy. */
async function current(now = Date.now()) {
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  if (!pending) {
    pending = load()
      .then((value) => {
        cache = { value, at: Date.now() };
        return value;
      })
      .catch((err) => {
        console.error('[quizRules]', err.message);
        const value = cache?.value || defaults();
        cache = { value, at: Date.now() - CACHE_MS + RETRY_MS };
        return value;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Checks and stores a whole rules object; Odoo refusing throws 503 and keeps the old rules. */
async function save(input) {
  const next = validate(input);
  if (odoo.isConfigured()) {
    try {
      await odoo.call('ir.config_parameter', 'set_param', [PARAM, JSON.stringify(next)]);
    } catch (err) {
      if (isAccessError(err)) throw new QuizRulesError('تعذّر الحفظ في أودو: حساب الربط يحتاج صلاحية الإعدادات', { status: 503, code: 'odoo_access' });
      throw new QuizRulesError(`تعذّر الحفظ في أودو: ${err.message}`, { status: 502, code: 'odoo' });
    }
  } else {
    fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(next, null, 1));
  }
  cache = { value: next, at: Date.now() };
  return next;
}

/**
 * The rules in GET /api/app/v1/config: what the engines read (web/src/shop/quiz.ts
 * and the app's src/catalog/quiz.ts) - the factory file's notes left out.
 */
function publicRules(value) {
  return { version: value.version, mattresses: value.mattresses, questions: value.questions, first_bonus: value.first_bonus };
}

/** Where the rules are kept: Odoo's system parameter, or this server's file. */
function storage() {
  return odoo.isConfigured() ? 'odoo' : 'local';
}

/** Back to the factory's rules (the panel's «استعادة قواعد المصنع»). */
async function reset() {
  return save(defaults());
}

/** Tests only. */
function _resetCache() {
  cache = null;
}

module.exports = { PARAM, CACHE_MS, QuizRulesError, defaults, validate, load, current, save, reset, publicRules, storage, _resetCache };
