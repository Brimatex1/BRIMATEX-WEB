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

// -- A commercial decision, not data hygiene --
//
// Foam blocks are not sold online: they are sold at the factory, and the shop -
// website and app alike - stays for mattresses and toppers. The rule used to
// live in the app alone (src/api.ts:isSoldInApp) while the website showed them,
// so it moved here: the server is one source both channels agree on, and the
// rule no longer needs an app release to take effect.
//
// Matching by name, because Odoo gives us no shop categories - every product
// comes back as category: 'mattress' whatever it is. All ten blocks in the
// catalogue start with "قالب اسفنج" (checked: no other name in the catalogue
// carries the word, and the toppers stay because theirs read "فرشة ..."). If a
// product is ever named "مرتبة بإسفنج ميموري" it will be hidden by mistake -
// which is why matching by name is temporary, until Odoo carries a real
// category.
const NOT_SOLD_ONLINE = /إسفنج|اسفنج|foam/i;

/** What is sold online. Blocks are excluded by the owner's decision. */
function isSoldOnline(product) {
  return !NOT_SOLD_ONLINE.test(String(product?.name ?? ''));
}

/**
 * What is actually shown and orderable: a priced record **and** one allowed to
 * be sold here. Called from `visibleOnly` and from `validateOrder` both -
 * hiding alone does not prevent an order.
 */
function isOfferable(product) {
  return isSellable(product) && isSoldOnline(product);
}

module.exports = { isSellable, isSoldOnline, isOfferable, UNPRICED, NOT_SOLD_ONLINE };
