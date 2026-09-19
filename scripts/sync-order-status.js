#!/usr/bin/env node
// مزامنة حالات الطلبات من أودو وإرسال إشعارات ما تبدّل — تشغّلها مهمّة cron.
//
// الإشعار كان يُرسل فقط حين تتغيّر الحالة من لوحة إدارة المتجر، والفريق يعمل
// في أودو. فتأكيد الفاتورة أو تسجيل الدفع هناك كان يمرّ بلا أن يعلم العميل.
//
// المنطق في src/lib/orderSync.js (مُختبَر بعميل أودو مُستعار). هذا السكربت
// يوصل القطع ويطبع ما يستحقّ الطباعة.
//
// الاستعمال:
//   node scripts/sync-order-status.js            # مزامنة وإرسال
//   VERBOSE=1 node scripts/sync-order-status.js  # اطبع حتى لو لا جديد
//   DRY_RUN=1 node scripts/sync-order-status.js  # قراءة فقط: لا تحديث ولا إشعار
//
// يخرج بـ0 دائماً ما لم يسقط شيءٌ غير متوقّع: مهمّة cron تفشل بصمت وإلا
// أغرقت البريد. الأخطاء تُطبع في السجلّ.

require('../src/lib/no-undici');
require('../src/lib/load-env');

const odoo = require('../src/lib/odoo');
const orders = require('../src/lib/orders');
const push = require('../src/lib/push');
const { syncOrderStatuses } = require('../src/lib/orderSync');
const db = require('../src/lib/db');

const DRY_RUN = process.env.DRY_RUN === '1';
// صامتٌ ما لم يحدث شيء: المهمّة تعمل كل عشر دقائق، وثلاثة أسطر في كل مرّة
// تعني آلاف الأسطر شهرياً تُغرق السطر الوحيد المهمّ. تُحتجز الأسطر وتُطبع
// فقط إن تبدّل طلب أو فشل شيء.
const VERBOSE = process.env.VERBOSE === '1' || DRY_RUN;

const buffered = [];
const stamp = (line) => `${new Date().toISOString()} ${line}`;

function log(line) {
  if (VERBOSE) console.log(stamp(line));
  else buffered.push(stamp(line));
}

function flush() {
  for (const line of buffered) console.log(line);
  buffered.length = 0;
}

(async () => {
  log(`المخزن: ${db.isConfigured() ? 'postgres' : 'files'}`);
  try {
    const summary = await syncOrderStatuses({
      odoo,
      orders: DRY_RUN ? { listOrders: orders.listOrders, updateOrder: async () => null } : orders,
      push: DRY_RUN
        ? { stageOf: push.stageOf, notifyOrderStage: async () => ({ sent: 0, reason: 'dry_run' }) }
        : push,
      log,
    });

    const line =
      `تمّت المزامنة${DRY_RUN ? ' (قراءة فقط)' : ''}: فُحص ${summary.checked} · تبدّل ` +
      `${summary.changed} · إشعارات ${summary.notified} · فشل ${summary.failed}`;

    if (summary.changed || summary.failed) {
      flush();
      console.log(stamp(line));
    } else if (VERBOSE) {
      console.log(stamp(line));
    }
  } catch (err) {
    flush();
    // بعض الأخطاء (تجمّع أخطاء pg مثلاً) رسالتها فارغة — نطبع ما يكفي للتشخيص.
    console.log(stamp(`✗ سقطت المزامنة: ${err.message || err.code || err.name || 'خطأ بلا رسالة'}`));
    if (err.stack) console.error(err.stack);
  }
  process.exit(0);
})();
