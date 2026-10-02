/**
 * The admin panel's routes (/admin, the 2026 design) - /api/panel/...
 *
 * Staff only, and per section: every route, reads included, checks the
 * caller's role against the section it serves (src/lib/auth.js sectionsFor):
 *
 *   admin      مدير            every section (التقييمات and الربط والتكاملات are
 *                              admin only; their reads and writes are the classic
 *                              dashboard's admin-only routes, src/routes/admin.js)
 *   marketing  تسويق           الواجهة، الإشعارات، ساعدني أختار، المراتب
 *   support    خدمة العملاء     نظرة عامة، الطلبات
 *
 * The classic dashboard (/admin/classic, src/routes/admin.js) stays admin only.
 *
 * Odoo is written to in these places only: «تأكيد» on a new order runs the sale
 * order's action_confirm, when an admin or support user presses it; «حفظ» in
 * الإعدادات sets the system parameter brimatex.app.settings (admin); «حفظ» in
 * الواجهة والبانرات sets brimatex.app.home and in ساعدني أختار brimatex.app.quiz
 * (admin, marketing); and «حفظ» in المراتب writes a catalogue mattress's
 * image_1920, product tags and description_sale (admin, marketing). The banners'
 * pictures stay files on this server (src/lib/home.js), not Odoo attachments, and
 * so does the shop's own photo of a mattress (src/lib/panelProducts.js).
 */
'use strict';

const auth = require('../lib/auth');
const orders = require('../lib/orders');
const odoo = require('../lib/odoo');
const push = require('../lib/push');
const perks = require('../lib/perks');
const devices = require('../lib/devices');
const home = require('../lib/home');
const instagram = require('../lib/instagram');
const panel = require('../lib/panel');
const appSettings = require('../lib/appSettings');
const quizRules = require('../lib/quizRules');
const panelProducts = require('../lib/panelProducts');
const { DAYS_TEXT } = require('../lib/delivery');
const { getProducts, visibleOnly, productLookup } = require('../lib/catalogue');
const { sendJson, readBody } = require('../lib/respond');

/** Same as its counterpart in routes/auth.js - the router moves on to the next module. */
const NOT_HANDLED = Symbol('panel-route-not-handled');

/** Roles that may confirm an order («تأكيد»). */
const CONFIRMERS = ['admin', 'support'];

/**
 * The signed-in staff member, or null after answering: 401 without a valid
 * session, 403 for a customer or for a section outside the role.
 */
async function staffFor(req, res, section) {
  const token = req.headers.authorization?.split(' ')[1];
  const session = token ? await auth.verifySession(token) : null;
  if (!session) {
    sendJson(res, 401, { error: 'غير مصرح' });
    return null;
  }
  const user = await auth.getUser(session.userId);
  if (!user) {
    sendJson(res, 401, { error: 'غير مصرح' });
    return null;
  }
  if (!auth.isStaff(user)) {
    sendJson(res, 403, { error: 'ليست لديك صلاحية', code: 'not_staff' });
    return null;
  }
  if (section && !auth.canAccess(user, section)) {
    sendJson(res, 403, { error: 'هذا القسم ليس ضمن صلاحياتك', code: 'section' });
    return null;
  }
  return user;
}

async function jsonBody(req, res) {
  try {
    return JSON.parse((await readBody(req)) || '{}');
  } catch {
    sendJson(res, 400, { error: 'JSON غير صالح' });
    return null;
  }
}

/** Every order, its times as strings. */
async function allOrders() {
  return (await orders.listOrders()).map(panel.normalize);
}

/** Which device placed which order - an empty index if the registry cannot be read. */
async function platforms() {
  try {
    return panel.platformIndex(await devices.listPlatforms());
  } catch {
    return panel.platformIndex([]);
  }
}

/** The catalogue, or an empty one: a slow Odoo must not take the panel down with it. */
async function catalogue() {
  try {
    return (await getProducts()).products || [];
  } catch {
    return [];
  }
}

function createPanelRoutes() {
  return async function handlePanelRoutes(req, res, url) {
    if (!url.pathname.startsWith('/api/panel/')) return NOT_HANDLED;

    // Who is signed in, what they may open, and the sidebar's badges.
    if (req.method === 'GET' && url.pathname === '/api/panel/me') {
      const user = await staffFor(req, res, null);
      if (!user) return;
      const sections = auth.sectionsFor(user);
      let pendingOrders = null;
      if (sections.includes('orders')) {
        pendingOrders = (await allOrders()).filter((o) => panel.statusOf(o) === 'new').length;
      }
      // Reviews waiting to be published or hidden (التقييمات - admin only).
      let pendingReviews = null;
      if (sections.includes('reviews')) {
        pendingReviews = (await perks.adminReviews().catch(() => [])).filter((r) => r.pending).length;
      }
      return sendJson(res, 200, {
        user: { id: user.id, name: user.name || '', phone: user.phone || '' },
        role: auth.roleOf(user),
        sections,
        canConfirm: CONFIRMERS.includes(auth.roleOf(user)),
        odooUrl: odoo.webUrl(),
        badges: { orders: pendingOrders, reviews: pendingReviews },
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/panel/overview') {
      const user = await staffFor(req, res, 'overview');
      if (!user) return;
      const isAdmin = auth.isAdmin(user);
      const [list, index, products] = await Promise.all([allOrders(), platforms(), catalogue()]);
      const numbers = panel.overview(list, { index });

      // Reviews and photos are an admin's to deal with (التقييمات, المراتب).
      let reviewsPending = null;
      let productsWithoutPhoto = null;
      if (isAdmin) {
        reviewsPending = (await perks.adminReviews().catch(() => [])).filter((r) => r.pending).length;
        const visible = visibleOnly(products);
        productsWithoutPhoto = { count: visible.filter((p) => !p.image).length, total: visible.length };
      }

      // «ما يراه العملاء الآن»: the first banner the website shows (الواجهة والبانرات).
      const live = home.publicHome(await home.current(), 'web').banners;
      const first = live[0] || null;

      return sendJson(res, 200, {
        ...numbers,
        reviewsPending,
        productsWithoutPhoto,
        banner: first ? { imageUrl: first.photo, link: first.link || '', title: first.title, count: live.length } : null,
        // Offer notifications arrive with the الإشعارات section (phase 5).
        lastPush: null,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/panel/orders') {
      const user = await staffFor(req, res, 'orders');
      if (!user) return;
      const query = panel.readQuery(url.searchParams);
      const [list, index, products] = await Promise.all([allOrders(), platforms(), catalogue()]);
      return sendJson(res, 200, {
        ...panel.listOrders(list, query, { index, lookup: productLookup(products), odooUrl: odoo.webUrl() }),
        query,
      });
    }

    const confirmMatch = url.pathname.match(/^\/api\/panel\/orders\/([^/]+)\/confirm$/);
    if (req.method === 'POST' && confirmMatch) {
      const user = await staffFor(req, res, 'orders');
      if (!user) return;
      if (!CONFIRMERS.includes(auth.roleOf(user))) {
        return sendJson(res, 403, { error: 'التأكيد للمدير وخدمة العملاء فقط', code: 'section' });
      }
      const name = decodeURIComponent(confirmMatch[1]);
      const before = await orders.getOrderByName(name);
      if (!before) return sendJson(res, 404, { error: 'الطلب غير موجود' });
      const status = panel.statusOf(panel.normalize(before));
      if (status === 'cancelled') return sendJson(res, 409, { error: 'الطلب ملغى' });
      if (status !== 'new') return sendJson(res, 409, { error: 'الطلب مؤكد بالفعل' });

      if (before.odooOrderId) {
        if (!odoo.isConfigured()) {
          return sendJson(res, 503, { error: 'أودو غير متصل الآن، فلا يمكن تأكيد الطلب' });
        }
        try {
          await odoo.confirmSaleOrder(Number(before.odooOrderId));
        } catch (err) {
          if (err.code === 'cancelled') return sendJson(res, 409, { error: 'الطلب ملغى في أودو' });
          if (err.code === 'missing') return sendJson(res, 404, { error: 'الطلب غير موجود في أودو' });
          return sendJson(res, 502, { error: `تعذّر التأكيد في أودو: ${err.message}` });
        }
      }
      // A demo order (no Odoo) is confirmed in the local record only.
      const updated = await orders.updateOrder(name, { invoiceStatus: 'confirmed' });
      console.log(`[panel] ${name} confirmed by ${user.id} (${auth.roleOf(user)})`);
      // «تم تأكيد طلبك» to the customer's phone. Never throws - see src/lib/push.js.
      void push.notifyOrderStage(before, updated);

      const [index, products] = await Promise.all([platforms(), catalogue()]);
      return sendJson(res, 200, {
        order: panel.toRow(panel.normalize(updated), { index, lookup: productLookup(products), odooUrl: odoo.webUrl() }),
      });
    }

    // ---- الإعدادات: the apps' and the website's settings (admin only) ----

    if ((req.method === 'GET' || req.method === 'PUT') && url.pathname === '/api/panel/settings') {
      const user = await staffFor(req, res, 'settings');
      if (!user) return;
      if (!auth.isAdmin(user)) return sendJson(res, 403, { error: 'للمدير فقط', code: 'section' });

      let value;
      try {
        if (req.method === 'GET') {
          value = await appSettings.load();
        } else {
          const body = await jsonBody(req, res);
          if (!body) return;
          value = await appSettings.save(body.settings ?? body);
          console.log(`[panel] settings saved by ${user.id} (${appSettings.storage()})`);
        }
      } catch (err) {
        if (!(err instanceof appSettings.AppSettingsError)) throw err;
        return sendJson(res, err.status, { error: err.message, field: err.field, code: err.code });
      }
      return sendJson(res, 200, {
        settings: value,
        storage: appSettings.storage(),
        // «مدن التوصيل» is read-only: free to every city, on these days.
        delivery: { fee: 0, days: DAYS_TEXT },
      });
    }

    // ---- الواجهة والبانرات: the home's banners and sections (admin and marketing) ----

    if ((req.method === 'GET' || req.method === 'PUT') && url.pathname === '/api/panel/home') {
      const user = await staffFor(req, res, 'home');
      if (!user) return;
      let value;
      try {
        if (req.method === 'GET') {
          value = await home.load();
        } else {
          // Five banners' worth of text and addresses - the pictures are uploaded on their own.
          let body;
          try {
            body = JSON.parse((await readBody(req, 200_000)) || '{}');
          } catch {
            return sendJson(res, 400, { error: 'JSON غير صالح' });
          }
          value = await home.save(body.home ?? body);
          console.log(`[panel] home saved by ${user.id} (${home.storage()})`);
        }
      } catch (err) {
        if (!(err instanceof home.HomeError)) throw err;
        return sendJson(res, err.status, { error: err.message, field: err.field, banner: err.banner, code: err.code });
      }
      return sendJson(res, 200, {
        home: value,
        storage: home.storage(),
        limits: { maxPublished: home.MAX_PUBLISHED, maxBanners: home.MAX_BANNERS, titleMax: home.TITLE_MAX },
      });
    }

    // A banner picture: { imageDataUrl, kind: 'photo' | 'app' } → { url, width, height }.
    if (req.method === 'POST' && url.pathname === '/api/panel/home/images') {
      const user = await staffFor(req, res, 'home');
      if (!user) return;
      let payload;
      try {
        // A 3 MB picture is about 4 MB as base64.
        payload = JSON.parse(await readBody(req, 4_500_000));
      } catch {
        return sendJson(res, 413, { error: 'حجم الصورة كبير جداً' });
      }
      const result = home.saveImage(payload.imageDataUrl, payload.kind);
      if (result.error) return sendJson(res, result.status, { error: result.error });
      return sendJson(res, 201, result);
    }

    // «من إنستغرام بريماتكس» - the classic dashboard's editor (src/lib/instagram.js), here for marketing too.
    if (url.pathname === '/api/panel/home/instagram' || url.pathname.startsWith('/api/panel/home/instagram/')) {
      const user = await staffFor(req, res, 'home');
      if (!user) return;
      const readJson = async (limit) => {
        try {
          return JSON.parse(await readBody(req, limit));
        } catch (err) {
          return { __error: err.message };
        }
      };
      const reply = (result) => (result.error ? sendJson(res, result.status, { error: result.error }) : sendJson(res, 200, result));

      if (req.method === 'GET' && url.pathname === '/api/panel/home/instagram') {
        return sendJson(res, 200, { posts: instagram.list(), max: instagram.MAX_POSTS });
      }
      if (req.method === 'POST' && url.pathname === '/api/panel/home/instagram') {
        const payload = await readJson(4_500_000);
        if (payload.__error) return sendJson(res, 413, { error: 'حجم الصورة كبير جداً' });
        return reply(instagram.add(payload.imageDataUrl, payload.link));
      }
      if (req.method === 'PUT' && url.pathname === '/api/panel/home/instagram/order') {
        const payload = await readJson();
        if (payload.__error) return sendJson(res, 400, { error: 'JSON غير صالح' });
        return reply(instagram.reorder(payload.ids));
      }
      const one = url.pathname.match(/^\/api\/panel\/home\/instagram\/([a-f0-9]{16})$/);
      if (one && req.method === 'DELETE') return reply(instagram.remove(one[1]));
      return sendJson(res, 404, { error: 'غير موجود' });
    }

    // ---- ساعدني أختار: the quiz's rules (admin and marketing) ----

    if ((req.method === 'GET' || req.method === 'PUT') && url.pathname === '/api/panel/quiz') {
      const user = await staffFor(req, res, 'quiz');
      if (!user) return;
      let value;
      try {
        if (req.method === 'GET') {
          value = await quizRules.load();
        } else {
          const body = await jsonBody(req, res);
          if (!body) return;
          value = await quizRules.save(body.rules ?? body);
          console.log(`[panel] quiz rules saved by ${user.id} (${quizRules.storage()})`);
        }
      } catch (err) {
        if (!(err instanceof quizRules.QuizRulesError)) throw err;
        return sendJson(res, err.status, { error: err.message, field: err.field, code: err.code });
      }
      return sendJson(res, 200, { rules: quizRules.publicRules(value), storage: quizRules.storage() });
    }

    // «استعادة قواعد المصنع»: the factory's rules (src/data/quiz-rules.json) replace the stored ones.
    if (req.method === 'POST' && url.pathname === '/api/panel/quiz/reset') {
      const user = await staffFor(req, res, 'quiz');
      if (!user) return;
      let value;
      try {
        value = await quizRules.reset();
      } catch (err) {
        if (!(err instanceof quizRules.QuizRulesError)) throw err;
        return sendJson(res, err.status, { error: err.message, field: err.field, code: err.code });
      }
      console.log(`[panel] quiz rules reset to the factory's by ${user.id} (${quizRules.storage()})`);
      return sendJson(res, 200, { rules: quizRules.publicRules(value), storage: quizRules.storage() });
    }

    // ---- المراتب: what the shop shows and Odoo's product fields (admin and marketing) ----

    if (url.pathname === '/api/panel/products' || url.pathname.startsWith('/api/panel/products/')) {
      const user = await staffFor(req, res, 'products');
      if (!user) return;
      const reply = async (work) => {
        try {
          return sendJson(res, 200, await work());
        } catch (err) {
          if (!(err instanceof panelProducts.PanelProductsError)) throw err;
          return sendJson(res, err.status, { error: err.message, field: err.field, code: err.code });
        }
      };

      if (req.method === 'GET' && url.pathname === '/api/panel/products') {
        return reply(() => panelProducts.list());
      }

      // «ما يظهر في المتجر»: description, feature icons, shown or hidden - by the shop's product id.
      const shopMatch = url.pathname.match(/^\/api\/panel\/products\/(\d+)\/shop$/);
      if (shopMatch && req.method === 'PATCH') {
        const body = await jsonBody(req, res);
        if (!body) return;
        return reply(async () => {
          const saved = await panelProducts.saveShop(Number(shopMatch[1]), body);
          console.log(`[panel] product ${shopMatch[1]} (shop) saved by ${user.id}`);
          return { productId: Number(shopMatch[1]), ...saved };
        });
      }

      // The shop's photo: { imageDataUrl } uploads one; DELETE goes back to the catalogue's.
      const imageMatch = url.pathname.match(/^\/api\/panel\/products\/(\d+)\/shop\/image$/);
      if (imageMatch && (req.method === 'POST' || req.method === 'DELETE')) {
        const id = Number(imageMatch[1]);
        if (req.method === 'DELETE') return reply(async () => ({ productId: id, ...(await panelProducts.removeShopImage(id)) }));
        let payload;
        try {
          // A 5 MB picture is about 6.7 MB as base64.
          payload = JSON.parse(await readBody(req, 7_000_000));
        } catch {
          return sendJson(res, 413, { error: 'حجم الصورة كبير جداً', field: 'image' });
        }
        return reply(async () => ({ productId: id, ...(await panelProducts.saveShopImage(id, payload.imageDataUrl)) }));
      }

      // «في أودو»: image_1920, product tags, description_sale - by the Odoo template id.
      const odooMatch = url.pathname.match(/^\/api\/panel\/products\/odoo\/(\d+)$/);
      if (odooMatch && req.method === 'PUT') {
        let payload;
        try {
          payload = JSON.parse((await readBody(req, 7_000_000)) || '{}');
        } catch {
          return sendJson(res, 413, { error: 'حجم الطلب كبير جداً' });
        }
        return reply(async () => {
          const row = await panelProducts.saveOdoo(Number(odooMatch[1]), payload);
          console.log(`[panel] product template ${odooMatch[1]} (Odoo) saved by ${user.id}`);
          return { product: row };
        });
      }

      return sendJson(res, 404, { error: 'غير موجود' });
    }

    // ---- The team: who may open the panel (admin only) ----

    if (req.method === 'GET' && url.pathname === '/api/panel/users') {
      const user = await staffFor(req, res, 'settings');
      if (!user) return;
      if (!auth.isAdmin(user)) return sendJson(res, 403, { error: 'للمدير فقط', code: 'section' });
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 60);
      const users = (await auth.listUsers())
        .filter((u) => (q ? [u.name, u.phone].some((v) => String(v || '').toLowerCase().includes(q)) : u.role !== 'customer'))
        // Newest first: the person just added is the one being looked for.
        .sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0))
        .slice(0, 50)
        .map((u) => ({ id: u.id, name: u.name || '', phone: u.phone || '', role: u.role, locked: Boolean(u.locked) }));
      return sendJson(res, 200, { users });
    }

    const roleMatch = url.pathname.match(/^\/api\/panel\/users\/([^/]+)\/role$/);
    if ((req.method === 'PATCH' || req.method === 'PUT') && roleMatch) {
      const actor = await staffFor(req, res, 'settings');
      if (!actor) return;
      if (!auth.isAdmin(actor)) return sendJson(res, 403, { error: 'للمدير فقط', code: 'section' });
      const body = await jsonBody(req, res);
      if (!body) return;
      if (!auth.ROLES.includes(body.role)) return sendJson(res, 400, { error: 'دور غير معروف' });

      const userId = decodeURIComponent(roleMatch[1]);
      const target = await auth.getUser(userId);
      if (!target) return sendJson(res, 404, { error: 'المستخدم غير موجود' });
      // An env-granted admin cannot be changed here - the change would not stick.
      if (auth.isBootstrapAdmin(target.phone)) {
        return sendJson(res, 409, { error: 'هذا الحساب مدير عبر إعدادات الخادم، ويُعدَّل من ADMIN_PHONES' });
      }
      // An admin removing their own access could lock everyone out.
      if (target.id === actor.id && body.role !== 'admin') {
        return sendJson(res, 409, { error: 'لا يمكنك تغيير صلاحيتك بنفسك' });
      }
      await auth.updateUser(userId, { role: body.role });
      return sendJson(res, 200, { id: userId, role: body.role });
    }

    return NOT_HANDLED;
  };
}

module.exports = { createPanelRoutes, NOT_HANDLED };
