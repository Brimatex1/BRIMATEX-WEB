// Whether an Odoo record is a thing we may actually sell.
//
// Why this exists: the catalogue is whatever Odoo publishes, and Odoo will
// happily publish records that are not products. Three reached the live
// store and were orderable by customers:
//
//     id 6     Expenses                              1 د.ل   (accounting record)
//     id 7825  فرشة بوردو ضغط 15/17 (H7, 70*180)      1 د.ل   (half-created variant)
//     id 7826  فرشة بوردو ضغط 20/22 (H9, 70*190)      1 د.ل
//
// `1` is not a price anyone typed — it is Odoo's default `list_price` for a
// record nobody priced. The cheapest real product in the catalogue is 53
// د.ل, and every one of the 33 products that carry size variants prices
// every variant identically to its card, so no genuine item sits near this
// floor. Treating "price ≤ 1" as "not for sale" costs us nothing real and
// stops a mis-tagged record from being sold for one dinar.
//
// This is a guard, not the fix: the record should be unpublished in Odoo.
// But the store must not depend on the ERP being tidy — a wrong tag there
// should cost us a missing card, never a mattress sold at 1 د.ل.

/** Odoo's default list_price. A record at or below this was never priced. */
const UNPRICED = 1;

/**
 * Pass a product card or one of its variants — both carry `price`, and both
 * are reachable as an order line id (see productLookup in server.js), so
 * both have to be checked.
 */
function isSellable(product) {
  const price = Number(product?.price);
  return Number.isFinite(price) && price > UNPRICED;
}

// ── قرار تجاري، لا نظافة بيانات ──
//
// قوالب الإسفنج لا تُباع عبر الإنترنت: تُباع في المصنع، ويبقى المتجر —
// الموقع والتطبيق كلاهما — للمراتب والفرشات. القاعدة كانت في التطبيق وحده
// (‎src/api.ts:isSoldInApp‎) والموقع يعرضها، فصارت هنا: الخادم مصدرٌ واحد
// يوافق عليه القناتان، ولا تحتاج القاعدة إلى تحديث نسخة تطبيق كي تسري.
//
// التمييز بالاسم لأن أودو لا يعطينا تصنيفات متجر — كل منتج يعود
// ‎category: 'mattress'‎ مهما كان. وكل القوالب العشرة في الكتالوج تبدأ
// بـ«قالب اسفنج» (تحقّقنا: لا اسمٌ آخر في الكتالوج يحمل الكلمة، والفرشات
// تبقى لأن أسماءها «فرشة …»). فإن سُمّي منتجٌ يوماً «مرتبة بإسفنج ميموري»
// فسيُحجب خطأً — ولذلك القاعدة بالاسم مؤقّتة حتى يحمل أودو تصنيفاً حقيقياً.
const NOT_SOLD_ONLINE = /إسفنج|اسفنج|foam/i;

/** ما يُباع عبر الإنترنت. القوالب تُستثنى بقرار المالك. */
function isSoldOnline(product) {
  return !NOT_SOLD_ONLINE.test(String(product?.name ?? ''));
}

/**
 * ما يُعرض ويُطلب فعلاً: سجلٌّ مُسعَّر **و** مسموحٌ بيعه هنا. تُستدعى من
 * ‎visibleOnly‎ ومن ‎validateOrder‎ كلتيهما — الإخفاء وحده لا يمنع الطلب.
 */
function isOfferable(product) {
  return isSellable(product) && isSoldOnline(product);
}

module.exports = { isSellable, isSoldOnline, isOfferable, UNPRICED, NOT_SOLD_ONLINE };
