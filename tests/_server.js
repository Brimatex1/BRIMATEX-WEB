// مُشغّل خادم الاختبار — واحد لكل الاختبارات.
//
// نشأ من عطلين حقيقيين وقعا فعلاً:
//
// ١. وراثة البيئة. كان كل اختبار يمرّر process.env كما هي، فيقرأ الخادم
//    المُولَّد ملف .env ومعه DATABASE_URL المُوجّه إلى Postgres على المضيف —
//    لا وجود له على جهاز تطوير، فيموت عند migrate. وstderr كان يُبتلع، فيظهر
//    العطل كـECONNREFUSED بلا سبب.
//
// ٢. الخادم اليتيم. server.kill() على ويندوز لا يقتل دائماً، فيبقى خادم من
//    تشغيل سابق يستمع على المنفذ. الاختبار التالي يفشل في الحجز بصمت —
//    ويتحدّث إلى ذلك الغريب. فكان smoke.test.js ينجح شهوراً وهو يختبر كوداً
//    قديماً لا الكود الذي في المستودع.
//
// ولذلك هنا حارسان: بيئة محكمة، ورفضٌ صريح للانطلاق إن كان المنفذ مشغولاً.
// الفشل الصريح أرحم من نجاحٍ كاذب.

'use strict';

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** هل يستمع أحد على هذا المنفذ الآن؟ */
function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (busy) => {
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(700);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function ping(port) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/api/health', method: 'GET' },
      (res) => {
        res.resume();
        res.on('end', resolve);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * يُقلع خادماً محكماً على `port` ويعيده مع مرجع إلى خرجه.
 *
 * البيئة الافتراضية تُفرّغ كل ما يربط الخادم بالعالم: قاعدة البيانات وأودو
 * ورمز واتساب. فالمخزن ملفّي، والكتالوج تجريبي، ورمز التحقّق يُطبع في السجلّ
 * بدل إرساله — يكتمل كل تدفّق بلا تكلفة ولا أثر خارجي.
 *
 * `env` يضيف أو يتجاوز. و`out` كائن يحمل `text` المتراكم كي يقرأه الاختبار.
 */
async function startTestServer({ port, env = {} } = {}) {
  if (await portBusy(port)) {
    console.error(
      '\x1b[31mالمنفذ ' + port + ' مشغول — خادمٌ من تشغيل سابق لم يُغلق.\x1b[0m'
    );
    console.error('أغلقه ثم أعد المحاولة. الاختبار لا يتحدّث إلى خادم لم يُقلعه بنفسه.');
    process.exit(1);
  }

  const out = { text: '' };
  const server = spawn('node', [path.join(ROOT, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: '',
      ODOO_URL: '',
      ODOO_DB: '',
      ODOO_USERNAME: '',
      ODOO_API_KEY: '',
      WHATSAPP_TOKEN: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => (out.text += d));
  server.stderr.on('data', (d) => (out.text += d));

  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) break;
    try {
      await ping(port);
      return { server, out };
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  server.kill();
  console.error('\x1b[31mالخادم لم يُقلع على المنفذ ' + port + '\x1b[0m');
  console.error(out.text.trim() || '(لا خرج من الخادم)');
  process.exit(1);
}

module.exports = { startTestServer };
