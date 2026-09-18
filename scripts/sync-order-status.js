#!/usr/bin/env node
// مزامنة حالات الطلبات من أودو وإرسال إشعارات ما تبدّل — تشغّلها مهمّة cron.
//
// الإشعار كان يُرسل فقط حين تتغيّر الحالة من لوحة إدارة المتجر، والفريق يعمل
// في أودو. فتأكيد الفاتورة أو تسجيل الدفع هناك كان يمرّ بلا أن يعلم العميل.
//
// المنطق في src/lib/orderSync.js (مُختبَر بعميل أودو مُستعار). هذا السكربت
// يوصل القطع ويطبع ملخّصاً.
//
// الاستعمال:
//   node scripts/sync-order-status.js          # مزامنة وإرسال
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

function log(line) {
  console.log(`${new Date().toISOString()} ${line}`);
}

(async () => {
  log(`المخزن: ${db.isConfigured() ? 'postgres' : 'files'}`);
  try {
    const summary = await syncOrderStatuses({
      odoo,
      orders: DRY_RUN
        ? { listOrders: orders.listOrders, updateOrder: async () => null }
        : orders,
      push: DRY_RUN
        ? { stageOf: push.stageOf, notifyOrderStage: async () => ({ sent: 0, reason: 'dry_run' }) }
        : push,
      log,
    });
    log(
      `تمّت المزامنة${DRY_RUN ? ' (قراءة فقط)' : ''}: فُحص ${summary.checked} · تبدّل ` +
        `${summary.changed} · إشعارات ${summary.notified} · فشل ${summary.failed}`
    );
  } catch (err) {
    // بعض الأخطاء (تجمّع أخطاء pg مثلاً) رسالتها فارغة — نطبع ما يكفي للتشخيص.
    log(`✗ سقطت المزامنة: ${err.message || err.code || err.name || 'خطأ بلا رسالة'}`);
    if (err.stack) console.error(err.stack);
  }
  process.exit(0);
})();
