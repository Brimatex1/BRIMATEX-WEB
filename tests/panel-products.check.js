#!/usr/bin/env node
// The panel's «المراتب» - /api/panel/products (src/lib/panelProducts.js).
//
// What it guards:
//   - admin and marketing read and edit; support and customers cannot;
//   - «ما يظهر في المتجر»: the shop's own record per product - description, the
//     website's feature icons (known icons only), shown or hidden, the photo - and
//     the public catalogue (/api/products) follows at once;
//   - «في أودو»: the eight catalogue mattresses read from product.template (كراون too,
//     though the shop does not sell it), with the photo's state, the native tags and
//     the record's link; a save writes image_1920, product_tag_ids and description_sale
//     in one product.template.write - checked whole first - making a tag only when
//     Odoo has none by that name;
//   - without Odoo the Odoo side says so (503 on a save); an Odoo that refuses
//     answers 503 and nothing is half-written.
//
// Runs with the rest: npm test

'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { startTestServer } = require('./_server');

const PORT = Number(process.env.TEST_PORT || 3271);
const ODOO_PORT = PORT + 1;
const FAKE_ODOO_PORT = PORT + 2;
const uniq = () => '09' + Math.floor(10000000 + Math.random() * 89999999);
const PUBLIC = path.join(__dirname, '..', 'src', 'public');

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

function tempFile(name, content = '{}\n') {
  const file = path.join(os.tmpdir(), `brimatex-${name}-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(file, content);
  return file;
}

/** A PNG's first bytes - what the server checks (the bytes decide, not the declared type). */
function pngBase64() {
  const buf = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.write('IHDR', 12, 'ascii');
  return buf.toString('base64');
}
const PNG = 'data:image/png;base64,' + pngBase64();

async function register(port, name, phone) {
  const r = await req(port, 'POST', '/api/auth/register', { name, phone, password: 'secret123' });
  return { token: r.json?.token, id: r.json?.user?.id, status: r.status };
}

/** Three roles on a fresh server: admin (from ADMIN_PHONES), marketing, support - and a customer. */
async function team(port, adminPhone) {
  const r = (...args) => req(port, ...args);
  const admin = await register(port, 'المدير', adminPhone);
  const customer = await register(port, 'عميل', uniq());
  const marketing = await register(port, 'التسويق', uniq());
  const support = await register(port, 'خدمة العملاء', uniq());
  await r('PATCH', `/api/panel/users/${marketing.id}/role`, { role: 'marketing' }, bearer(admin.token));
  await r('PATCH', `/api/panel/users/${support.id}/role`, { role: 'support' }, bearer(admin.token));
  return { admin, customer, marketing, support };
}

async function localServer() {
  const ADMIN_PHONE = uniq();
  const settingsFile = tempFile('products-settings');
  const overridesFile = tempFile('products-overrides');
  const uploaded = new Set();
  const { server, out } = await startTestServer({ port: PORT, env: { ADMIN_PHONES: ADMIN_PHONE, BRIMATEX_SETTINGS_FILE: settingsFile, BRIMATEX_OVERRIDES_FILE: overridesFile } });
  const r = (...args) => req(PORT, ...args);
  try {
    console.log('\n\x1b[1m1. الصلاحيات: المدير والتسويق نعم، خدمة العملاء لا\x1b[0m');
    const { admin, customer, marketing, support } = await team(PORT, ADMIN_PHONE);
    ok('بلا رمز ← 401', (await r('GET', '/api/panel/products')).status === 401);
    ok('العميل ← 403', (await r('GET', '/api/panel/products', null, bearer(customer.token))).status === 403);
    const sp = await r('GET', '/api/panel/products', null, bearer(support.token));
    ok('خدمة العملاء ← 403 (section)', sp.status === 403 && sp.json?.code === 'section');
    ok('خدمة العملاء لا تعدّل ← 403', (await r('PATCH', '/api/panel/products/1/shop', { enabled: false }, bearer(support.token))).status === 403);
    ok('خدمة العملاء لا ترفع صورة ← 403', (await r('POST', '/api/panel/products/1/shop/image', { imageDataUrl: PNG }, bearer(support.token))).status === 403);
    ok('خدمة العملاء لا تكتب في أودو ← 403', (await r('PUT', '/api/panel/products/odoo/4776', { descriptionSale: 'x' }, bearer(support.token))).status === 403);
    ok('العميل لا يعدّل ← 403', (await r('PATCH', '/api/panel/products/1/shop', { enabled: false }, bearer(customer.token))).status === 403);

    console.log('\n\x1b[1m2. بلا أودو\x1b[0m');
    const mk = await r('GET', '/api/panel/products', null, bearer(marketing.token));
    ok('التسويق يقرأ ← 200', mk.status === 200, `${mk.status}`);
    ok('أودو غير متصل', mk.json?.odoo?.connected === false && mk.json?.odoo?.url === null);
    ok('مراتب الكتالوج الثماني أولاً، بالترتيب', mk.json?.products?.slice(0, 8).map((p) => p.key).join() === 'crown,deluxe,hotel,sport,balance,comfort,daily,classic');
    ok('بلا جانب أودو ولا رابط', mk.json?.products?.every((p) => p.odoo === null && p.odooLink === null));
    ok('ومنتجات المتجر التجريبية بعدها', mk.json?.products?.slice(8).length === 4 && mk.json.products.slice(8).every((p) => p.shop?.id));
    ok('وقائمة الأيقونات', mk.json?.featureIcons?.includes('warranty-10y') && mk.json.featureIcons.includes('made-in-libya'));
    ok('المدير يقرأ ← 200', (await r('GET', '/api/panel/products', null, bearer(admin.token))).status === 200);
    const off = await r('PUT', '/api/panel/products/odoo/4776', { descriptionSale: 'وصف' }, bearer(marketing.token));
    ok('الحفظ في أودو ← 503 (odoo_off)', off.status === 503 && off.json?.code === 'odoo_off', `${off.status} ${JSON.stringify(off.json)}`);

    console.log('\n\x1b[1m3. ما يظهر في المتجر: التحقق\x1b[0m');
    const bad = async (label, body, field, status = 400) => {
      const res = await r('PATCH', '/api/panel/products/1/shop', body, bearer(marketing.token));
      ok(`${label} ← ${status} (${field})`, res.status === status && res.json?.field === field, `${res.status} ${JSON.stringify(res.json)}`);
    };
    await bad('أيقونة غير معروفة', { features: ['warranty-10y', 'rocket'] }, 'features');
    await bad('مميزات ليست قائمة', { features: 'warranty-10y' }, 'features');
    await bad('وصف أطول من 2000 حرف', { description: 'ع'.repeat(2001) }, 'description');
    await bad('ظهور ليس true/false', { enabled: 'no' }, 'enabled');
    const missing = await r('PATCH', '/api/panel/products/999999/shop', { enabled: false }, bearer(marketing.token));
    ok('منتج غير موجود ← 404', missing.status === 404);
    ok('لم يُكتب شيء', JSON.stringify(JSON.parse(fs.readFileSync(overridesFile, 'utf8'))) === '{}');

    console.log('\n\x1b[1m4. ما يظهر في المتجر: الحفظ يصل إلى الكتالوج فوراً\x1b[0m');
    const hide = await r('PATCH', '/api/panel/products/1/shop', { enabled: false, description: '  وصف المتجر الجديد  ', features: ['warranty-10y', 'pocket-springs', 'warranty-10y'] }, bearer(marketing.token));
    ok('التسويق يحفظ ← 200', hide.status === 200 && hide.json?.enabled === false && hide.json?.description === 'وصف المتجر الجديد', `${hide.status} ${JSON.stringify(hide.json)}`);
    ok('المميزات بلا تكرار', hide.json?.features?.join() === 'warranty-10y,pocket-springs');
    const pub1 = (await r('GET', '/api/products')).json?.products || [];
    ok('المخفية خارج الكتالوج العام', pub1.length === 3 && !pub1.some((p) => p.id === 1), String(pub1.length));
    await r('PATCH', '/api/panel/products/1/shop', { enabled: true }, bearer(admin.token));
    const shown = ((await r('GET', '/api/products')).json?.products || []).find((p) => p.id === 1);
    ok('تعود ظاهرة بالوصف والأيقونات', shown?.description === 'وصف المتجر الجديد' && shown?.featureIcons?.join() === 'warranty-10y,pocket-springs', JSON.stringify(shown?.featureIcons));
    const row = (await r('GET', '/api/panel/products', null, bearer(marketing.token))).json?.products?.find((p) => p.shop?.id === 1);
    ok('اللوحة ترى التعديل ومصدره', row?.shop?.descriptionOverride === 'وصف المتجر الجديد' && row?.shop?.featuresOverride?.length === 2 && row?.shop?.enabled === true);
    await r('PATCH', '/api/panel/products/1/shop', { description: '', features: null }, bearer(marketing.token));
    const restored = ((await r('GET', '/api/products')).json?.products || []).find((p) => p.id === 1);
    ok('وصف فارغ ومميزات null ← ما في الكتالوج', restored?.description && restored.description !== 'وصف المتجر الجديد' && (restored.featureIcons ?? []).length === 0, JSON.stringify(restored?.featureIcons));

    console.log('\n\x1b[1m5. صورة المتجر\x1b[0m');
    const notImage = await r('POST', '/api/panel/products/1/shop/image', { imageDataUrl: 'data:image/png;base64,' + Buffer.from('<svg/>').toString('base64') }, bearer(marketing.token));
    ok('ملف ليس صورة ← 400 (image)', notImage.status === 400 && notImage.json?.field === 'image');
    const up = await r('POST', '/api/panel/products/1/shop/image', { imageDataUrl: PNG }, bearer(marketing.token));
    ok('رفع PNG ← 200', up.status === 200 && /^\/uploads\/products\/1-\d+\.png$/.test(up.json?.imageUrl || ''), JSON.stringify(up.json));
    if (up.json?.imageUrl) uploaded.add(up.json.imageUrl);
    ok('وتُخدم', (await r('GET', up.json?.imageUrl || '/x')).status === 200);
    ok('والكتالوج يعرضها', ((await r('GET', '/api/products')).json?.products || []).find((p) => p.id === 1)?.image === up.json?.imageUrl);
    const up2 = await r('POST', '/api/panel/products/1/shop/image', { imageDataUrl: PNG }, bearer(admin.token));
    if (up2.json?.imageUrl) uploaded.add(up2.json.imageUrl);
    await new Promise((res) => setTimeout(res, 200));
    ok('صورة جديدة تحذف السابقة', up2.status === 200 && up2.json.imageUrl !== up.json?.imageUrl && !fs.existsSync(path.join(PUBLIC, up.json?.imageUrl || '/x')));
    const del = await r('DELETE', '/api/panel/products/1/shop/image', null, bearer(marketing.token));
    await new Promise((res) => setTimeout(res, 200));
    ok('الحذف ← صورة الكتالوج', del.status === 200 && del.json?.imageUrl === null && !fs.existsSync(path.join(PUBLIC, up2.json?.imageUrl || '/x')));

    console.log('\n\x1b[1m6. العنوان\x1b[0m');
    const page = await r('GET', '/admin/products');
    ok('/admin/products ← 200 الواجهة', page.status === 200 && page.text.includes('<div id="root">'), 'status ' + page.status);
  } catch (err) {
    fail++;
    failures.push('استثناء: ' + err.message);
    console.error(err);
    console.error(out.text);
  } finally {
    server.kill();
    fs.rmSync(settingsFile, { force: true });
    fs.rmSync(overridesFile, { force: true });
    for (const u of uploaded) fs.rmSync(path.join(PUBLIC, u), { force: true });
  }
}

/* ---------------------------------------------------------------- a fake Odoo with the catalogue */

const T = (id, name, categ, variants, extra = {}) => ({
  id,
  name,
  categ_id: categ,
  product_variant_ids: variants,
  list_price: 0,
  product_tag_ids: [],
  description_sale: false,
  image_128: false,
  ...extra,
});
const COMFORT = [17, 'Mattresses / Comfort'];
const PREMIUM = [18, 'Mattresses / Premium'];
const ELITE = [19, 'Mattresses / Elite'];

function fakeOdoo() {
  const state = {
    templates: [
      T(4873, '[MS-CRWN] مرتبة كراون', [30, 'مراتب 1'], [48731], { list_price: 1485 }),
      T(4792, 'مرتبة ديلوكس', ELITE, [47921], { list_price: 2105 }),
      T(4773, 'مرتبة هوتيل', PREMIUM, [47731], { list_price: 1370 }),
      T(4973, 'مرتبة سبورت', PREMIUM, [49731], { list_price: 1095 }),
      T(5012, 'مرتبة بالانس', PREMIUM, [50121], { list_price: 915 }),
      T(4776, 'مرتبة كومفورت', COMFORT, [47761, 47762], { list_price: 495, product_tag_ids: [1], description_sale: 'وصف أودو', image_128: '/9j/4AAQSkZJRgABAQ' }),
      T(4779, 'مرتبة دايلي', COMFORT, [47791], { list_price: 475 }),
      T(4782, 'مرتبة كلاسيك', COMFORT, [47821], { list_price: 355 }),
    ],
    tags: [
      { id: 1, name: 'تخفيف الضغط' },
      { id: 2, name: 'دعم طبي' },
      { id: 3, name: 'Pillow Top' },
    ],
    writes: [],
    created: [],
    denyWrite: false,
  };
  const variant = (id) => {
    const t = state.templates.find((x) => x.product_variant_ids.includes(id));
    return t ? { id, default_code: `V-${id}`, barcode: false, lst_price: t.list_price + (id % 10) * 100, qty_available: 3, product_template_attribute_value_ids: [] } : null;
  };
  const answer = (model, method, args, kwargs) => {
    const domain = JSON.stringify(args?.[0] ?? []);
    if (model === 'ir.config_parameter' && method === 'get_param') return false;
    if (model === 'product.category' && method === 'search_read') {
      if (domain.includes('"Mattresses"')) return [{ id: 15 }];
      return [
        { id: 16, name: 'Economy' },
        { id: 17, name: 'Comfort' },
        { id: 18, name: 'Premium' },
        { id: 19, name: 'Elite' },
      ];
    }
    if (model === 'product.template' && method === 'search_read') {
      const byId = (args[0] || []).find((c) => Array.isArray(c) && c[0] === 'id' && c[1] === 'in');
      const rows = byId ? state.templates.filter((t) => byId[2].includes(t.id)) : state.templates.filter((t) => [17, 18, 19].includes(t.categ_id[0]));
      return rows.map((t) => Object.fromEntries((kwargs?.fields || Object.keys(t)).map((f) => [f, t[f]])));
    }
    if (model === 'product.product' && method === 'read') return args[0].map(variant).filter(Boolean);
    if (model === 'product.pricelist' && method === 'search_read') return [];
    if (model === 'product.pricelist.item' && method === 'search_read') return [];
    if (model === 'product.template.attribute.value' && method === 'read') return [];
    if (model === 'product.tag' && method === 'search_read') {
      const byName = (args[0] || []).find((c) => Array.isArray(c) && c[0] === 'name');
      return byName ? state.tags.filter((t) => t.name.toLowerCase() === String(byName[2]).toLowerCase()).slice(0, 1) : state.tags;
    }
    if (model === 'product.tag' && method === 'create') {
      const tag = { id: 100 + state.created.length, name: args[0].name };
      state.created.push(tag.name);
      state.tags.push(tag);
      return tag.id;
    }
    if (model === 'product.template' && method === 'write') {
      if (state.denyWrite) return { error: ['odoo.exceptions.AccessError', "You are not allowed to modify 'Product' (product.template) records."] };
      state.writes.push(args);
      const [ids, vals] = args;
      for (const t of state.templates.filter((x) => ids.includes(x.id))) {
        if ('description_sale' in vals) t.description_sale = vals.description_sale;
        if ('image_1920' in vals) t.image_128 = vals.image_1920;
        if (vals.product_tag_ids) t.product_tag_ids = vals.product_tag_ids[0][2];
      }
      return true;
    }
    return { error: ['odoo.exceptions.UserError', `not in the fake: ${model}.${method}`] };
  };
  const server = http.createServer((rq, rs) => {
    let raw = '';
    rq.on('data', (c) => (raw += c));
    rq.on('end', () => {
      const { id, params } = JSON.parse(raw || '{}');
      const reply = (body) => {
        rs.writeHead(200, { 'Content-Type': 'application/json' });
        rs.end(JSON.stringify({ jsonrpc: '2.0', id, ...body }));
      };
      if (params?.service === 'common' && params.method === 'login') return reply({ result: 7 });
      if (params?.service === 'common') return reply({ result: { server_version: '19.0' } });
      const [, , , model, method, args, kwargs] = params?.args || [];
      const result = answer(model, method, args, kwargs);
      if (result && result.error) return reply({ error: { code: 200, message: 'Odoo Server Error', data: { name: result.error[0], message: result.error[1] } } });
      return reply({ result });
    });
  });
  return new Promise((resolve) => server.listen(FAKE_ODOO_PORT, '127.0.0.1', () => resolve({ server, state })));
}

async function odooServer() {
  const ADMIN_PHONE = uniq();
  const settingsFile = tempFile('products-odoo-settings');
  const overridesFile = tempFile('products-odoo-overrides');
  const odoo = await fakeOdoo();
  const ODOO_URL = `http://127.0.0.1:${FAKE_ODOO_PORT}`;
  const { server, out } = await startTestServer({
    port: ODOO_PORT,
    env: {
      ADMIN_PHONES: ADMIN_PHONE,
      BRIMATEX_SETTINGS_FILE: settingsFile,
      BRIMATEX_OVERRIDES_FILE: overridesFile,
      ODOO_URL,
      ODOO_DB: 'test',
      ODOO_USERNAME: 'bot@brimatex.ly',
      ODOO_API_KEY: 'test-key',
    },
  });
  const r = (...args) => req(ODOO_PORT, ...args);
  try {
    console.log('\n\x1b[1m7. مع أودو: product.template\x1b[0m');
    const { marketing, admin } = await team(ODOO_PORT, ADMIN_PHONE);
    const got = await r('GET', '/api/panel/products', null, bearer(marketing.token));
    ok('200 وأودو متصل', got.status === 200 && got.json?.odoo?.connected === true && !got.json.odoo.error, `${got.status} ${JSON.stringify(got.json?.odoo)}`);
    const rows = Object.fromEntries((got.json?.products || []).map((p) => [p.key, p]));
    ok('ثماني مراتب فقط', got.json?.products?.length === 8);
    ok('كراون: من أودو وحده، ليست في المتجر', rows.crown?.shop === null && rows.crown?.odoo?.listPrice === 1485 && rows.crown.odoo.category === 'مراتب 1', JSON.stringify(rows.crown));
    ok('رابط السجل في أودو', rows.crown?.odooLink === `${ODOO_URL}/odoo/action-sale.product_template_action/4873`);
    ok('كمفورت: صورة أودو موجودة، والبقية ناقصة', rows.comfort?.odoo?.hasImage === true && /^data:image\/jpeg;base64,/.test(rows.comfort.odoo.image || '') && Object.values(rows).filter((p) => p.odoo?.hasImage === false).length === 7);
    ok('الوسوم بأسمائها', rows.comfort?.odoo?.tags?.map((t) => t.name).join() === 'تخفيف الضغط' && got.json?.tags?.length === 3);
    ok('وصف أودو', rows.comfort?.odoo?.descriptionSale === 'وصف أودو' && rows.hotel?.odoo?.descriptionSale === '');
    ok('جانب المتجر: المعرّف والسعر والمقاسات', rows.comfort?.shop?.id === 47761 && rows.comfort.shop.sizes === 2 && rows.comfort.shop.priceFrom === 595, JSON.stringify(rows.comfort?.shop));
    ok('وصورة المتجر من الكتالوج', rows.comfort?.shop?.imageSource === 'catalogue' && rows.comfort.shop.image === '/images/products/comfort.webp');
    ok('وأيقونات الموقع من الكتالوج', rows.comfort?.shop?.features?.length > 0 && rows.comfort.shop.featuresOverride === null);

    console.log('\n\x1b[1m8. الحفظ في أودو: التحقق قبل الكتابة\x1b[0m');
    const bad = async (label, id, body, status, field) => {
      const res = await r('PUT', `/api/panel/products/odoo/${id}`, body, bearer(marketing.token));
      ok(`${label} ← ${status}${field ? ` (${field})` : ''}`, res.status === status && (!field || res.json?.field === field), `${res.status} ${JSON.stringify(res.json)}`);
    };
    await bad('صورة ليست صورة', 4776, { image: 'data:image/png;base64,' + Buffer.from('hello').toString('base64'), descriptionSale: 'x' }, 400, 'image');
    await bad('وسم أطول من 40 حرفاً', 4776, { tagIds: [1], newTags: ['و'.repeat(41)] }, 400, 'tags');
    await bad('معرّف وسم غير صالح', 4776, { tagIds: ['1'] }, 400, 'tags');
    await bad('بلا تغييرات', 4776, {}, 400);
    await bad('منتج ليس من مراتب الكتالوج', 9999, { descriptionSale: 'x' }, 404);
    ok('لم يُكتب شيء في أودو', odoo.state.writes.length === 0 && odoo.state.created.length === 0);

    console.log('\n\x1b[1m9. الحفظ في أودو: write واحد\x1b[0m');
    const saved = await r('PUT', '/api/panel/products/odoo/4776', { image: PNG, tagIds: [1], newTags: ['pillow top', 'عزل الحركة'], descriptionSale: '  وصف جديد للبيع  ' }, bearer(marketing.token));
    ok('التسويق يحفظ ← 200', saved.status === 200, `${saved.status} ${JSON.stringify(saved.json)?.slice(0, 300)}`);
    ok('وسم جديد واحد فقط (Pillow Top موجود)', odoo.state.created.join() === 'عزل الحركة');
    const [ids, vals] = odoo.state.writes[0] || [];
    ok('product.template.write على 4776', JSON.stringify(ids) === '[4776]' && odoo.state.writes.length === 1);
    ok('image_1920 بلا بادئة data:', vals?.image_1920 === pngBase64());
    ok('product_tag_ids: (6, 0, ids)', JSON.stringify(vals?.product_tag_ids) === JSON.stringify([[6, 0, [1, 3, 100]]]), JSON.stringify(vals?.product_tag_ids));
    ok('description_sale مقصوص', vals?.description_sale === 'وصف جديد للبيع');
    ok('الرد: الصف من أودو من جديد', saved.json?.product?.odoo?.hasImage === true && saved.json.product.odoo.tags.map((t) => t.name).join() === 'تخفيف الضغط,Pillow Top,عزل الحركة');
    const clear = await r('PUT', '/api/panel/products/odoo/4873', { descriptionSale: '' }, bearer(admin.token));
    ok('كراون تُحفظ في أودو أيضاً، والوصف الفارغ false', clear.status === 200 && JSON.stringify(odoo.state.writes[1]) === JSON.stringify([[4873], { description_sale: false }]), JSON.stringify(odoo.state.writes[1]));
    ok('الوسوم فقط ← product_tag_ids وحده', (await r('PUT', '/api/panel/products/odoo/4773', { tagIds: [] }, bearer(admin.token))).status === 200 && JSON.stringify(odoo.state.writes[2]) === JSON.stringify([[4773], { product_tag_ids: [[6, 0, []]] }]));

    odoo.state.denyWrite = true;
    const denied = await r('PUT', '/api/panel/products/odoo/4776', { descriptionSale: 'لا' }, bearer(marketing.token));
    ok('أودو يرفض ← 503 برسالة الصلاحية', denied.status === 503 && denied.json?.code === 'odoo_access' && /صلاحية المنتجات/.test(denied.json?.error || ''), `${denied.status} ${JSON.stringify(denied.json)}`);
    ok('والقيمة باقية', odoo.state.templates.find((t) => t.id === 4776).description_sale === 'وصف جديد للبيع');

    console.log('\n\x1b[1m10. المتجر مع أودو\x1b[0m');
    const shop = await r('PATCH', '/api/panel/products/47761/shop', { enabled: false }, bearer(marketing.token));
    ok('إخفاء كمفورت من المتجر (معرّف المتجر) ← 200', shop.status === 200 && shop.json?.enabled === false);
    ok('والكتالوج العام بدونها', !((await r('GET', '/api/products')).json?.products || []).some((p) => p.id === 47761));
    ok('ولا كتابة في أودو بسببها', odoo.state.writes.length === 3);
  } catch (err) {
    fail++;
    failures.push('استثناء: ' + err.message);
    console.error(err);
    console.error(out.text);
  } finally {
    server.kill();
    odoo.server.close();
    fs.rmSync(settingsFile, { force: true });
    fs.rmSync(overridesFile, { force: true });
  }
}

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — المراتب في اللوحة ═══\x1b[0m');
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
