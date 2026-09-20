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

const auth = require('../lib/auth');
const otp = require('../lib/otp');
const orders = require('../lib/orders');
const { sendJson, readBody } = require('../lib/respond');

/**
 * Returned when the path is not one of this module's, so the router keeps
 * walking its chain. A Symbol rather than true/false: every route here ends in
 * `return sendJson(...)`, which yields undefined, so an ordinary value could be
 * confused with it - and using one would have meant editing every return in the
 * file, which is exactly what moving verbatim avoids.
 */
const NOT_HANDLED = Symbol('auth-route-not-handled');

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
      const { phone, password } = payload;
      if (!phone?.trim() || !password?.trim()) {
        return sendJson(res, 400, { error: 'رقم الهاتف والكلمة المرورية مطلوبة' });
      }
      const user = await auth.authenticate(phone, password);
      if (!user) {
        return sendJson(res, 401, { error: 'رقم الهاتف أو الكلمة المرورية غير صحيحة' });
      }
      const token = await auth.createSession(user.id);
      return sendJson(res, 200, {
        message: 'تم الدخول بنجاح',
        token,
        user: { id: user.id, phone: user.phone, name: user.name },
      });
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

      // A registered number gets nothing: no code, and no separate message
      // either — Meta fixes the body text of authentication templates, so
      // telling the owner "you already have an account" would need a second
      // template of category UTILITY.
      const user = await auth.findByPhone(phone);
      if (!user) {
        const result = await otp.requestCode(phone);
        if (!result.issued) console.log(`[signup OTP] not sent for ${phone}: ${result.reason}`);
      }

      // Identical reply either way, exactly as in the recovery route — varying it
      // would answer "does this number have an account here?" for anyone asking.
      return sendJson(res, 200, { message: 'إن كان الرقم متاحاً فسيصلك رمز على واتساب' });
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
          // Effective role, so the UI knows whether to offer the dashboard.
          role: auth.roleOf(user),
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
    if (req.method === 'DELETE' && url.pathname === '/api/auth/me') {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return sendJson(res, 401, { error: 'غير مصرح' });
      const session = await auth.verifySession(token);
      if (!session) return sendJson(res, 401, { error: 'رمز الجلسة غير صحيح' });

      // Unlink before delete so the orders survive on both backends, not only
      // where the foreign key happens to be `on delete set null`.
      await orders.unlinkUser(session.userId);
      const deleted = await auth.deleteUser(session.userId);
      if (!deleted) return sendJson(res, 404, { error: 'المستخدم غير موجود' });

      return sendJson(res, 200, { message: 'تم حذف الحساب نهائياً' });
    }


    return NOT_HANDLED;
  };
}

module.exports = { createAuthRoutes, NOT_HANDLED };
