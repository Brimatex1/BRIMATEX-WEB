#!/usr/bin/env node
// The loyalty add-on - src/lib/loyalty.js against a fake Odoo (no network):
//  - without Odoo's loyalty modules, or without a points program, everything says enabled:false
//  - the balance, its value, how points are earned and the history come from the program in Odoo
//  - coupons split into usable and spent/expired; a code is checked (owner, expiry, minimum)
//  - points OR a coupon on one order, never both; applying uses sale_loyalty's own wizards
//
// Runs with the rest: npm test

'use strict';

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

/* A tiny Odoo: records per model, a domain filter for the leaves loyalty.js uses, and a call log. */
const db = {};
const calls = [];
let installed = true;
function matches(rec, [field, op, value]) {
  const get = (f) => {
    if (f.includes('.')) {
      const [rel, sub] = f.split('.');
      const target = db['loyalty.program'].find((p) => p.id === (Array.isArray(rec[rel]) ? rec[rel][0] : rec[rel]));
      return target?.[sub];
    }
    const v = rec[f];
    return Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'string' ? v[0] : v;
  };
  const v = get(field);
  if (op === '=') return v === value;
  if (op === 'in') return value.includes(v);
  throw new Error('op ' + op);
}
const fakeOdoo = {
  isConfigured: () => true,
  phoneForms: (p) => [p],
  async call(model, method, args, kwargs = {}) {
    calls.push({ model, method, args });
    if (model === 'ir.model' && method === 'search_count') return installed ? 2 : 0;
    const table = db[model] || [];
    if (method === 'search') {
      let found = table.filter((r) => args[0].every((leaf) => matches(r, leaf)));
      if (kwargs.limit) found = found.slice(0, kwargs.limit);
      return found.map((r) => r.id);
    }
    if (method === 'read') return args[0].map((id) => table.find((r) => r.id === id)).filter(Boolean);
    if (method === 'create') {
      const id = (db[model] = db[model] || []).length + 100;
      db[model].push({ id, ...args[0] });
      return id;
    }
    if (method === 'action_apply') {
      const order = db['sale.order'].find((o) => o.id === 7001);
      order.amount_total -= 50;
      return true;
    }
    throw new Error(`unexpected ${model}.${method}`);
  },
};
require.cache[path.resolve(__dirname, '../src/lib/odoo.js')] = { id: 'odoo', filename: 'odoo', loaded: true, exports: fakeOdoo };
const loyalty = require('../src/lib/loyalty');

const USER = { id: 'u1', phone: '0913334444', odooPartnerId: 55 };

(async () => {
  console.log('\nبرنامج الولاء (src/lib/loyalty.js)');

  installed = false;
  loyalty._reset();
  ok('بدون وحدات الولاء في أودو: enabled false', (await loyalty.summary(USER)).enabled === false);
  ok('والقسائم كذلك', (await loyalty.coupons(USER)).enabled === false);
  ok('وفحص الرمز يرفض بلطف', Boolean((await loyalty.checkCoupon(USER, 'X', 100)).error));

  installed = true;
  loyalty._reset();
  db['loyalty.program'] = [];
  ok('الوحدات مركّبة بلا برنامج نقاط: enabled false', (await loyalty.summary(USER)).enabled === false);

  db['loyalty.program'] = [
    { id: 1, name: 'نقاط بريماتكس', program_type: 'loyalty', active: true, rule_ids: [11], reward_ids: [21] },
    { id: 2, name: 'قسيمة إليت', program_type: 'coupons', active: true, rule_ids: [12], reward_ids: [22] },
    { id: 3, name: 'خصم الطلبات الكبيرة', program_type: 'coupons', active: true, rule_ids: [13], reward_ids: [23] },
  ];
  db['loyalty.rule'] = [
    { id: 11, reward_point_amount: 1, reward_point_mode: 'money', minimum_amount: 0, program_id: [1, 'x'] },
    { id: 12, minimum_amount: 0, program_id: [2, 'x'] },
    { id: 13, minimum_amount: 2000, program_id: [3, 'x'], code: 'BIG10' },
  ];
  db['loyalty.reward'] = [
    { id: 21, reward_type: 'discount', discount_mode: 'per_point', discount: 0.02, required_points: 1, description: 'خصم النقاط' },
    { id: 22, reward_type: 'discount', discount_mode: 'per_order', discount: 50, description: 'على أي مرتبة من فئة إليت' },
    { id: 23, reward_type: 'discount', discount_mode: 'percent', discount: 10, description: 'للطلبات فوق 2000 د.ل' },
  ];
  db['loyalty.card'] = [
    { id: 31, program_id: [1, 'x'], partner_id: [55, 'x'], points: 1240, expiration_date: '2099-12-31', code: 'P1' },
    { id: 32, program_id: [2, 'x'], partner_id: [55, 'x'], points: 1, expiration_date: '2099-11-30', code: 'ELITE-50', write_date: '2026-09-01 10:00:00' },
    { id: 33, program_id: [2, 'x'], partner_id: [55, 'x'], points: 0, expiration_date: '2099-01-01', code: 'USED-1', write_date: '2026-08-01 10:00:00' },
    { id: 34, program_id: [2, 'x'], partner_id: [99, 'x'], points: 1, expiration_date: '2099-01-01', code: 'SOMEONE-ELSE' },
    { id: 35, program_id: [2, 'x'], partner_id: [55, 'x'], points: 1, expiration_date: '2000-01-01', code: 'OLD' },
  ];
  db['loyalty.history'] = [
    { id: 41, card_id: [31, 'x'], description: 'طلب', issued: 940, used: 0, order_model: 'sale.order', order_id: 7000, create_date: '2026-09-15 08:00:00' },
    { id: 42, card_id: [31, 'x'], description: 'خصم', issued: 0, used: 250, order_model: 'sale.order', order_id: 7001, create_date: '2026-09-20 08:00:00' },
  ];
  db['sale.order'] = [
    { id: 7000, name: 'S00431', amount_total: 940 },
    { id: 7001, name: 'S00512', amount_total: 2515 },
  ];

  const s = await loyalty.summary(USER);
  ok('الرصيد من بطاقة الزبون في أودو', s.enabled === true && s.points === 1240, JSON.stringify(s));
  ok('قيمة الرصيد من مكافأة البرنامج (0.02 للنقطة)', s.value === 24.8 && s.pointValue === 0.02, `${s.value} ${s.pointValue}`);
  ok('طريقة الكسب من قاعدة البرنامج: نقطة لكل دينار', s.earn?.points === 1 && s.earn?.perAmount === 1);
  ok('السجل: كسب بطلب، وخصم على طلب', s.history.length === 2 && s.history.some((h) => h.kind === 'earned' && h.label === 'طلب #S00431') && s.history.some((h) => h.kind === 'redeemed' && h.label === 'خصم على طلب #S00512'));
  ok('عدد القسائم المتاحة', s.couponsAvailable === 1, String(s.couponsAvailable));

  const c = await loyalty.coupons(USER);
  ok('المتاحة: قسيمة الزبون السارية فقط', c.available.length === 1 && c.available[0].code === 'ELITE-50' && c.available[0].value === 50);
  ok('المستخدمة والمنتهية في «المستخدمة»', c.used.map((u) => u.code).sort().join() === 'OLD,USED-1');
  ok('قسيمة زبون آخر لا تظهر', ![...c.available, ...c.used].some((x) => x.code === 'SOMEONE-ELSE'));

  ok('رمز صحيح: قيمة الخصم', (await loyalty.checkCoupon(USER, 'ELITE-50', 1760)).coupon?.discount === 50);
  ok('رمز زبون آخر يُرفض', Boolean((await loyalty.checkCoupon(USER, 'SOMEONE-ELSE', 1760)).error));
  ok('رمز منتهٍ يُرفض', Boolean((await loyalty.checkCoupon(USER, 'OLD', 1760)).error));
  ok('رمز ترويجي تحت الحد الأدنى: رسالة بالحد', /2000/.test((await loyalty.checkCoupon(USER, 'BIG10', 1500)).error || ''));
  ok('رمز ترويجي فوق الحد: 10٪', (await loyalty.checkCoupon(USER, 'BIG10', 2515)).coupon?.discount === 251.5);
  ok('رمز غير موجود', (await loyalty.checkCoupon(USER, 'NOPE', 2000)).error === 'الرمز غير صحيح أو منتهي');

  ok('نقاط وقسيمة معاً: مرفوض', Boolean(loyalty.readRequest({ usePoints: true, coupon: 'ELITE-50' }).error));
  ok('النقاط وحدها', loyalty.readRequest({ usePoints: true }).request?.usePoints === true);
  ok('قسيمة وحدها', loyalty.readRequest({ coupon: ' ELITE-50 ' }).request?.coupon === 'ELITE-50');
  ok('بلا شيء', loyalty.readRequest(undefined).request === null);

  calls.length = 0;
  const applied = await loyalty.applyToOrder(7001, { coupon: 'ELITE-50' });
  ok('القسيمة بمعالج أودو نفسه (sale.loyalty.coupon.wizard)', calls.some((x) => x.model === 'sale.loyalty.coupon.wizard' && x.method === 'action_apply'));
  ok('والإجمالي الجديد من الطلب', applied.total === 2465, String(applied.total));
  calls.length = 0;
  await loyalty.applyToOrder(7001, { usePoints: true });
  ok('النقاط بمعالج المكافآت (sale.loyalty.reward.wizard) ومكافأة البرنامج', calls.some((x) => x.model === 'sale.loyalty.reward.wizard' && x.method === 'create' && x.args[0].selected_reward_id === 21));

  console.log(`\n\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}`);
  if (fail) {
    console.log('\x1b[31mالفحوص الفاشلة:\x1b[0m\n' + failures.map((f) => '  • ' + f).join('\n'));
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
