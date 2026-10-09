/**
 * Account routes - registration, sign-in, phone verification and recovery.
 *
 * These ten routes lived inside handleApi in src/server.js, split into two
 * stretches with the /api/devices block sitting between them. They moved here
 * verbatim, with no logic change, and are together now.
 *
 * The three helpers are injected rather than imported: they are defined inside
 * server.js, and importing from it would create a cycle. The libraries are
 * required directly - no cycle there.
 */
'use strict';

const { rateKey } = require('../lib/clientIp');
const crypto = require('crypto');

const auth = require('../lib/auth');
const otp = require('../lib/otp');
const orders = require('../lib/orders');
const avatar = require('../lib/avatar');
const perks = require('../lib/perks');
const devices = require('../lib/devices');
const reviewAccount = require('../lib/reviewAccount');
const { sendJson, readBody } = require('../lib/respond');

/**
 * Returned when the path is not one of this module's, so the router keeps
 * walking its chain. A Symbol rather than true/false: every route here ends in
 * `return sendJson(...)`, which yields undefined, so an ordinary value could be
 * confused with it - and using one would have meant editing every return in the
 * file, which is exactly what moving verbatim avoids.
 */
const NOT_HANDLED = Symbol('auth-route-not-handled');

/**
 * The test suite's own servers (tests/_server.js) only: accounts made without
 * a code and orders without an account. Everywhere else a new account proves
 * its number with a WhatsApp code, once - then signs in with its password -
 * and every order comes from an account (src/routes/orders.js): a made-up
 * number can neither open an account nor order.
 */
const ALLOW_UNVERIFIED = process.env.BRIMATEX_ALLOW_UNVERIFIED === '1';

/**
 * Wrong passwords: five for one number within 15 minutes, then that number
 * waits (a guessed password is an account taken); twenty from one address.
 * A right one clears the number's count.
 */
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_FAILS_PER_PHONE = 5;
const LOGIN_FAILS_PER_ADDRESS = 20;
const loginFails = new Map();

function failsOf(key, now) {
  const list = (loginFails.get(key) || []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (list.length) loginFails.set(key, list);
  else loginFails.delete(key);
  return list;
}

function loginLocked(phone, ip, now = Date.now()) {
  return failsOf(`p:${phone}`, now).length >= LOGIN_FAILS_PER_PHONE || failsOf(`a:${ip}`, now).length >= LOGIN_FAILS_PER_ADDRESS;
}

function recordLoginFail(phone, ip, now = Date.now()) {
  for (const key of [`p:${phone}`, `a:${ip}`]) loginFails.set(key, [...failsOf(key, now), now]);
}

/** Sign-in codes asked for per address per minute - each one is a paid WhatsApp message. */
const CODE_REQUESTS_PER_MIN = 5;
const codeRequests = new Map();

function tooManyCodeRequests(ip) {
  const minute = Math.floor(Date.now() / 60_000);
  for (const key of codeRequests.keys()) {
    if (Number(key.slice(key.lastIndexOf(':') + 1)) < minute) codeRequests.delete(key);
  }
  const key = `${ip}:${minute}`;
  const count = (codeRequests.get(key) || 0) + 1;
  codeRequests.set(key, count);
  return count > CODE_REQUESTS_PER_MIN;
}

/** The request's JSON body, or null when it is not JSON. */
async function jsonBody(req) {
  try {
    return JSON.parse(await readBody(req));
  } catch {
    return null;
  }
}

function createAuthRoutes({ isValidPhone }) {
  return async function handleAuthRoutes(req, res, url) {
    // --- User Authentication ---
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'JSON غير صالح' });
      }
      const { password, name, phone, signupToken } = payload;
      if (!password?.trim() || !name?.trim()) {
        return sendJson(res, 400, { error: 'الاسم والكلمة المرورية مطلوبان' });
      }
      if (password.length < 6) {
        return sendJson(res, 400, { error: 'الكلمة المرورية يجب أن تكون 6 أحرف على الأقل' });
      }

      /* Two shapes of body, on purpose:

           { name, password, signupToken }  the verified path — the phone comes
                                            from the token, never from the body
           { name, phone, password }        the old path, still accepted so that
                                            app builds shipped before phone
                                            verification keep working

         Reading `phone` from the body alongside a token would undo the whole
         point: you could prove you own one number and register another. */
      let accountPhone;
      if (signupToken) {
        accountPhone = await otp.consumeResetToken(String(signupToken));
        if (!accountPhone) {
          return sendJson(res, 400, { error: 'انتهت صلاحية التوثيق — أعد المحاولة' });
        }
      } else {
        // A number nobody proved: closed - the account's number is checked by a WhatsApp code first.
        if (!ALLOW_UNVERIFIED) {
          return sendJson(res, 400, { error: 'أكّد رقمك برمز واتساب أولاً — حدّث التطبيق إن لم يظهر لك الرمز', code: 'verify_required' });
        }
        if (!phone?.trim()) {
          return sendJson(res, 400, { error: 'رقم الهاتف مطلوب' });
        }
        // Checked on new accounts only — existing users keep whatever they signed up with.
        if (!isValidPhone(phone)) {
          return sendJson(res, 400, { error: 'رقم الهاتف غير صالح' });
        }
        accountPhone = phone;
      }

      const user = await auth.createUser(accountPhone, password, name);
      if (!user) {
        return sendJson(res, 409, { error: 'هذا رقم الهاتف مسجل بالفعل' });
      }
      const token = await auth.createSession(user.id);
      return sendJson(res, 201, {
        message: 'تم التسجيل بنجاح',
        token,
        user: { id: user.id, phone: user.phone, name: user.name },
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'JSON غير صالح' });
      }
      const { password } = payload;
      const phone = String(payload.phone || '').trim();
      if (!phone || !password?.trim()) {
        return sendJson(res, 400, { error: 'رقم الهاتف وكلمة المرور مطلوبان' });
      }
      const ip = rateKey(req);
      if (loginLocked(phone, ip)) {
        return sendJson(res, 429, { error: 'محاولات كثيرة. انتظر 15 دقيقة، أو اختر «نسيت كلمة المرور».', code: 'locked' });
      }
      const user = await auth.authenticate(phone, password);
      if (!user) {
        recordLoginFail(phone, ip);
        // An account opened by code alone has no password of its own yet: «نسيت كلمة المرور» sets one.
        return sendJson(res, 401, { error: 'رقم الهاتف أو كلمة المرور غير صحيحة. أول مرة بكلمة مرور؟ اختر «نسيت كلمة المرور» لتعيينها.' });
      }
      loginFails.delete(`p:${phone}`);
      const token = await auth.createSession(user.id);
      return sendJson(res, 200, {
        message: 'تم الدخول بنجاح',
        token,
        user: { id: user.id, phone: user.phone, name: user.name, avatarUrl: user.avatarUrl || null },
      });
    }

    /* --- Sign in with a code: the app's only way in (no password) ---
       1. /phone/request   a 6-digit code on WhatsApp, to any valid number
       2. /phone/verify    the right code signs an account in; a number with no
                           account gets a single-use signupToken instead
       3. /phone/complete  signupToken + name creates the account, signed in
       Same challenge as recovery (src/lib/otp.js): five minutes, five tries,
       a minute between sends. Codes cost money, so each address may ask for
       a few a minute; the per-number minute is the otp library's. */

    if (req.method === 'POST' && url.pathname === '/api/auth/phone/request') {
      const ip = rateKey(req);
      if (tooManyCodeRequests(ip)) {
        return sendJson(res, 429, { error: 'طلبت رموزاً كثيرة. انتظر دقيقة ثم حاول مجدداً.' });
      }
      const payload = await jsonBody(req);
      if (!payload) return sendJson(res, 400, { error: 'JSON غير صالح' });
      const phone = String(payload.phone || '').trim();
      if (!phone || !isValidPhone(phone)) {
        return sendJson(res, 400, { error: 'رقم الهاتف غير صالح' });
      }
      const result = await otp.requestCode(phone);
      if (!result.issued && result.reason === 'cooldown') {
        return sendJson(res, 200, { sent: false, resendIn: result.retryInSeconds });
      }
      if (!result.issued) {
        console.log(`[phone login] not sent for ${phone}: ${result.reason}`);
        return sendJson(res, 502, { error: 'تعذّر إرسال الرمز الآن. حاول بعد قليل.' });
      }
      return sendJson(res, 200, { sent: true, resendIn: Math.round(otp.RESEND_COOLDOWN_MS / 1000) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/phone/verify') {
      const payload = await jsonBody(req);
      if (!payload) return sendJson(res, 400, { error: 'JSON غير صالح' });
      const phone = String(payload.phone || '').trim();
      const code = String(payload.code || '').trim();
      if (!phone || !code) {
        return sendJson(res, 400, { error: 'الرقم والرمز مطلوبان' });
      }
      const result = await otp.verifyCode(phone, code);
      if (!result.ok) {
        const error =
          result.reason === 'too_many_attempts'
            ? 'محاولات كثيرة — اطلب رمزاً جديداً'
            : result.reason === 'expired'
              ? 'انتهت صلاحية الرمز — اطلب رمزاً جديداً'
              : `الرمز غير صحيح. تبقّت ${result.attemptsLeft} محاولات.`;
        return sendJson(res, 400, { error, reason: result.reason, attemptsLeft: result.attemptsLeft ?? 0 });
      }
      const user = await auth.findByPhone(phone);
      if (!user) return sendJson(res, 200, { needsName: true, signupToken: result.resetToken });
      // The proof is spent: the token is burned, the account signed in.
      await otp.consumeResetToken(result.resetToken);
      const token = await auth.createSession(user.id);
      return sendJson(res, 200, {
        token,
        user: { id: user.id, phone: user.phone, name: user.name, avatarUrl: user.avatarUrl || null },
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/phone/complete') {
      const payload = await jsonBody(req);
      if (!payload) return sendJson(res, 400, { error: 'JSON غير صالح' });
      const name = String(payload.name || '').trim();
      if (name.length < 2 || name.length > 60) {
        return sendJson(res, 400, { error: 'اكتب اسمك' });
      }
      const phone = await otp.consumeResetToken(String(payload.signupToken || ''));
      if (!phone) {
        return sendJson(res, 400, { error: 'انتهت صلاحية التوثيق — أعد المحاولة' });
      }
      // No password: the account is entered by code. A random one fills the
      // field; recovery can still set a real one for the website.
      const user = await auth.createUser(phone, crypto.randomBytes(24).toString('hex'), name);
      if (!user) {
        return sendJson(res, 409, { error: 'هذا رقم الهاتف مسجل بالفعل' });
      }
      const token = await auth.createSession(user.id);
      return sendJson(res, 201, { token, user: { id: user.id, phone: user.phone, name: user.name, avatarUrl: null } });
    }

    /* --- Phone verification for new accounts ---
       Same challenge machinery as password recovery below (src/lib/otp.js): one
       code per phone, five minutes, five attempts, a minute between sends. Only
       the account check is inverted — a code goes to a number that has *no*
       account yet.

       Why it exists: before this, anyone could sign up with a number they did
       not own, and the real owner ended up with an account they never made,
       receiving our order notifications.

       The two token namespaces are safe to share. A recovery token cannot create
       an account (register rejects a phone that already has one) and a signup
       token cannot change a password (that route 404s when the phone has no
       account), so neither can be spent on the other's route. */

    if (req.method === 'POST' && url.pathname === '/api/auth/signup/otp/request') {
      // Each code is a paid WhatsApp message: a few a minute per address, as the code sign-in.
      if (tooManyCodeRequests(rateKey(req))) {
        return sendJson(res, 429, { error: 'طلبت رموزاً كثيرة. انتظر دقيقة ثم حاول مجدداً.' });
      }
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'JSON غير صالح' });
      }
      const phone = String(payload.phone || '').trim();
      if (!phone || !isValidPhone(phone)) {
        return sendJson(res, 400, { error: 'رقم الهاتف غير صالح' });
      }

      // A registered number is told so, on the screen - no code is sent. The
      // owner's choice: a customer who already has an account should go to
      // sign-in (or «نسيت كلمة المرور»), not wait for a code that never comes.
      // It does say which numbers have an account; the code limits per number
      // and per address keep that from being asked in bulk.
      const user = await auth.findByPhone(phone);
      if (user) {
        return sendJson(res, 409, { error: 'هذا الرقم مسجّل من قبل. سجّل الدخول، أو اختر «نسيت كلمة المرور».', code: 'registered' });
      }
      const result = await otp.requestCode(phone);
      if (!result.issued) console.log(`[signup OTP] not sent for ${phone}: ${result.reason}`);
      return sendJson(res, 200, { message: 'أرسلنا رمزاً على واتساب' });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/signup/otp/verify') {
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'JSON غير صالح' });
      }
      const phone = String(payload.phone || '').trim();
      const code = String(payload.code || '').trim();
      if (!phone || !code) {
        return sendJson(res, 400, { error: 'الرقم والرمز مطلوبان' });
      }

      const result = await otp.verifyCode(phone, code);
      if (!result.ok) {
        const message =
          result.reason === 'too_many_attempts'
            ? 'محاولات كثيرة — اطلب رمزاً جديداً'
            : result.reason === 'expired'
              ? 'انتهت صلاحية الرمز — اطلب رمزاً جديداً'
              : 'الرمز غير صحيح';
        return sendJson(res, 400, { error: message });
      }

      // Same single-use token as recovery, named for what it authorises here.
      return sendJson(res, 200, { signupToken: result.resetToken });
    }

    /* --- Password recovery by one-time code over WhatsApp ---
       Three steps: ask for a code, prove you received it, choose a new password.
       Accounts are identified by phone and there is no email on file, so this is
       the only self-service route back into an account. See src/lib/otp.js for
       the code's lifetime, attempt limit and resend cooldown. */

    if (req.method === 'POST' && url.pathname === '/api/auth/otp/request') {
      if (tooManyCodeRequests(rateKey(req))) {
        return sendJson(res, 429, { error: 'طلبت رموزاً كثيرة. انتظر دقيقة ثم حاول مجدداً.' });
      }
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'JSON غير صالح' });
      }
      const phone = String(payload.phone || '').trim();
      if (!phone || !isValidPhone(phone)) {
        return sendJson(res, 400, { error: 'رقم الهاتف غير صالح' });
      }

      // A code is only ever sent to a number that has an account — otherwise the
      // endpoint is a free way to make us pay for messages to strangers.
      const user = await auth.findByPhone(phone);
      if (user) {
        const result = await otp.requestCode(phone);
        if (!result.issued) console.log(`[OTP] not sent for ${phone}: ${result.reason}`);
      }

      // The reply is identical either way — varying it would answer "does this
      // number have an account here?" for anyone who asks.
      return sendJson(res, 200, { message: 'إن كان الرقم مسجّلاً فسيصلك رمز على واتساب' });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/otp/verify') {
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'JSON غير صالح' });
      }
      const phone = String(payload.phone || '').trim();
      const code = String(payload.code || '').trim();
      if (!phone || !code) {
        return sendJson(res, 400, { error: 'الرقم والرمز مطلوبان' });
      }

      const result = await otp.verifyCode(phone, code);
      if (!result.ok) {
        const message =
          result.reason === 'too_many_attempts'
            ? 'محاولات كثيرة — اطلب رمزاً جديداً'
            : result.reason === 'expired'
              ? 'انتهت صلاحية الرمز — اطلب رمزاً جديداً'
              : 'الرمز غير صحيح';
        return sendJson(res, 400, { error: message });
      }

      return sendJson(res, 200, { resetToken: result.resetToken });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/password') {
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'JSON غير صالح' });
      }
      const { resetToken, password } = payload;
      if (!resetToken || !password) {
        return sendJson(res, 400, { error: 'الرمز والكلمة المرورية مطلوبان' });
      }
      if (String(password).length < 6) {
        return sendJson(res, 400, { error: 'الكلمة المرورية يجب أن تكون 6 أحرف على الأقل' });
      }

      // Single-use: the token is burned here whether or not the rest succeeds.
      const phone = await otp.consumeResetToken(String(resetToken));
      if (!phone) {
        return sendJson(res, 400, { error: 'انتهت صلاحية الطلب — ابدأ من جديد' });
      }

      const user = await auth.findByPhone(phone);
      if (!user) {
        return sendJson(res, 404, { error: 'المستخدم غير موجود' });
      }

      // Drops the old sessions too — see auth.setPassword.
      await auth.setPassword(user.id, String(password));
      const token = await auth.createSession(user.id);
      return sendJson(res, 200, {
        message: 'تم تغيير الكلمة المرورية',
        token,
        user: { id: user.id, phone: user.phone, name: user.name },
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return sendJson(res, 401, { error: 'لم يتم توفير رمز الجلسة' });
      }
      const session = await auth.verifySession(token);
      if (!session) {
        return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح أو منتهي الصلاحية' });
      }
      const user = await auth.getUser(session.userId);
      if (!user) {
        return sendJson(res, 404, { error: 'المستخدم غير موجود' });
      }
      const [addresses, wishlist] = await Promise.all([
        auth.listAddresses(user.id),
        auth.listWishlist(user.id),
      ]);
      return sendJson(res, 200, {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone || null,
          avatarUrl: user.avatarUrl || null,
          // Effective role, so the UI knows whether to offer the dashboard.
          role: auth.roleOf(user),
          // The app's last App Tracking Transparency answer (null: none yet).
          trackingStatus: user.trackingStatus || null,
          addresses,
          wishlist,
        },
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      // Actually invalidate the token. Clearing it in the browser alone left it
      // usable server-side for the remainder of its 30 days.
      const token = req.headers.authorization?.split(' ')[1];
      await auth.deleteSession(token);
      return sendJson(res, 200, { message: 'تم الخروج بنجاح' });
    }

    /**
     * Account deletion, required by App Store review guideline 5.1.1(v) for any
     * app that offers account creation. Deletes the account and everything on it,
     * but unlinks orders first instead of deleting them: the factory needs the
     * record for warranty and accounting, and it keeps it without naming anyone.
     */
    // The customer's own name (the app's settings). The phone is the account's
    // identity and is not changed here.
    if (req.method === 'PATCH' && url.pathname === '/api/auth/me') {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
      const session = await auth.verifySession(token);
      if (!session) return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });
      const payload = await jsonBody(req);
      if (!payload) return sendJson(res, 400, { error: 'JSON غير صالح' });
      const name = String(payload.name || '').trim();
      if (name.length < 2 || name.length > 60) return sendJson(res, 400, { error: 'اكتب اسمك' });
      const user = await auth.updateUser(session.userId, { name });
      if (!user) return sendJson(res, 404, { error: 'المستخدم غير موجود' });
      return sendJson(res, 200, { user: { id: user.id, name: user.name, phone: user.phone, avatarUrl: user.avatarUrl || null } });
    }

    if (req.method === 'DELETE' && url.pathname === '/api/auth/me') {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
      const session = await auth.verifySession(token);
      if (!session) return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });
      const leaving = await auth.getUser(session.userId);
      if (!leaving) return sendJson(res, 404, { error: 'المستخدم غير موجود' });

      // The owner of the number confirms with a WhatsApp code first (the
      // recovery flow: /api/auth/otp/request, then /otp/verify gives the
      // resetToken). A session alone - a phone left unlocked - cannot erase an
      // account for good. The token is burned here whatever happens next.
      let payload = {};
      try {
        payload = JSON.parse((await readBody(req)) || '{}');
      } catch {
        return sendJson(res, 400, { error: 'JSON غير صالح' });
      }
      const provedPhone = payload.resetToken ? await otp.consumeResetToken(String(payload.resetToken)) : null;
      if (!provedPhone || provedPhone !== leaving.phone) {
        return sendJson(res, 400, { error: 'أكّد الحذف برمز واتساب المرسل إلى رقمك', code: 'verify_required' });
      }

      // Unlink before delete so the orders survive on both backends, not only
      // where the foreign key happens to be `on delete set null`.
      await orders.unlinkUser(session.userId);
      // The file store has no cascade: its reviews, points records and devices
      // go explicitly (Postgres drops them with the user row).
      await perks.forgetUser(session.userId);
      await devices.forgetUser(session.userId);
      const deleted = await auth.deleteUser(session.userId);
      // Their photo goes with the account.
      if (deleted && leaving?.avatarUrl) avatar.remove(leaving.avatarUrl);
      if (!deleted) return sendJson(res, 404, { error: 'المستخدم غير موجود' });
      // Apple's reviewer tests deletion: their account comes straight back, empty.
      await reviewAccount.ensure();

      return sendJson(res, 200, { message: 'تم حذف الحساب نهائياً' });
    }


    return NOT_HANDLED;
  };
}

module.exports = { createAuthRoutes, NOT_HANDLED };
