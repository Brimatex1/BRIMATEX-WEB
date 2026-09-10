#!/usr/bin/env node
// تفرّد الطلبات — POST /api/orders لا يصنع طلبين لمحاولة دفع واحدة.
//
// السيناريو الذي يحميه: الطلب يصل الخادم ويُسجَّل، ثم تنقطع الشبكة قبل أن
// يصل الرد إلى الهاتف. التطبيق يرى انتهاء المهلة فيُبقي السلة ويعرض «حاول
// مجدداً»، والضغطة الثانية تحمل المفتاح نفسه — فيجب أن يردّ الخادم بالطلب
// الأول لا أن يفتح ثانياً.
//
// يشغَّل مع بقية الاختبارات: npm test

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || 3198;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            /* غير JSON */
          }
          resolve({ status: res.statusCode, json, body: raw });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const customer = {
  name: 'عميل اختبار التفرّد',
  phone: '0912345678',
  city: 'طرابلس',
  address: 'شارع الاختبار، عمارة 1',
};

async function run() {
  console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — تفرّد الطلبات ═══\x1b[0m\n');

  const server = spawn('node', [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT, RATE_LIMIT_ORDERS_PER_MIN: '200' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 50; i++) {
    try {
      await request('GET', '/api/health');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  try {
    const products = await request('GET', '/api/products');
    const product = (products.json?.products || []).find((p) => p.enabled !== false);
    if (!product) throw new Error('لا منتجات في الكتالوج');

    // كل طلب صحيح هنا يُنشئ عرض سعر فعلياً. آمن على الكتالوج التجريبي، لكنه
    // يلوّث مبيعات أودو الحقيقية — فنتخطّاه كما يفعل tests/smoke.test.js.
    const odooConfigured = require('../src/lib/odoo').isConfigured();
    if (odooConfigured) {
      console.log(
        '  \x1b[33m⚠\x1b[0m  Odoo متصل — تخطّي اختبار التفرّد لتفادي تلويث بيانات المبيعات'
      );
      return;
    }

    const order = { customer, items: [{ productId: product.id, quantity: 1 }] };
    const key = `req_test_${Date.now().toString(36)}`;

    console.log('\x1b[1m1. المفتاح نفسه لا يصنع طلباً ثانياً\x1b[0m');
    const first = await request('POST', '/api/orders', { ...order, requestId: key });
    check('المحاولة الأولى تُنشئ الطلب (201)', first.status === 201, `status ${first.status}`);
    check('الاستجابة تحمل رقم الطلب', Boolean(first.json?.orderName));

    const retry = await request('POST', '/api/orders', { ...order, requestId: key });
    check('إعادة المحاولة تُقبل (200 لا 201)', retry.status === 200, `status ${retry.status}`);
    check('الاستجابة معلَّمة replayed', retry.json?.replayed === true);
    check(
      'رقم الطلب هو نفسه لا رقم جديد',
      retry.json?.orderName === first.json?.orderName,
      `${first.json?.orderName} ≠ ${retry.json?.orderName}`
    );

    console.log('\n\x1b[1m2. محاولة جديدة تعني طلباً جديداً\x1b[0m');
    const other = await request('POST', '/api/orders', {
      ...order,
      requestId: `${key}_b`,
    });
    check('مفتاح مختلف يُنشئ طلباً (201)', other.status === 201, `status ${other.status}`);
    check(
      'رقمه يختلف عن الأول',
      other.json?.orderName && other.json.orderName !== first.json?.orderName
    );

    console.log('\n\x1b[1m3. التوافق مع عميل قديم بلا مفتاح\x1b[0m');
    const bare1 = await request('POST', '/api/orders', order);
    const bare2 = await request('POST', '/api/orders', order);
    check('طلب بلا مفتاح يُقبل (201)', bare1.status === 201, `status ${bare1.status}`);
    check(
      'طلبان بلا مفتاح يبقيان منفصلين',
      bare1.json?.orderName && bare2.json?.orderName !== bare1.json?.orderName,
      'مفتاح مفقود لا يجوز أن يُدمج مع طلب آخر'
    );

    console.log('\n\x1b[1m4. السجلّ\x1b[0m');
    const stored = require('../src/lib/orders');
    const replayed = await stored.getOrderByRequestId(key);
    check('الطلب يُسترجع بمفتاحه', replayed?.orderName === first.json?.orderName);
    check('مفتاح مجهول يعيد null', (await stored.getOrderByRequestId('req_لا_وجود_له')) === null);
    check('مفتاح فارغ يعيد null', (await stored.getOrderByRequestId('')) === null);
  } catch (err) {
    fail++;
    failures.push('خطأ غير متوقع: ' + err.message);
    console.error('\x1b[31m' + err.stack + '\x1b[0m');
  } finally {
    server.kill();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(
    `\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail}` +
      (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : '')
  );
  if (fail) {
    console.log('\n\x1b[31mالاختبارات الفاشلة:\x1b[0m');
    failures.forEach((f) => console.log('  • ' + f));
  }
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
}

run();
