/* ===== BRIMATEX Store — Application ===== */
'use strict';

const state = {
  token: localStorage.getItem('auth_token') || null,
  cart: [],
  products: [],
};

/* ---------- helpers ---------- */
function $(id) { return document.getElementById(id); }

function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str == null ? '' : str);
  return d.innerHTML;
}

function money(n) {
  return Number(n || 0).toLocaleString('ar-EG', { maximumFractionDigits: 0 });
}

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem('cart') || '[]');
    state.cart = Array.isArray(raw)
      ? raw.filter(i => i && Number.isInteger(i.id)).map(i => ({
          id: i.id,
          name: String(i.name || ''),
          price: Number(i.price) || 0,
          qty: Math.min(999, Math.max(1, parseInt(i.qty, 10) || 1)),
        }))
      : [];
  } catch { state.cart = []; }
}

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(state.cart));
}

function cartTotal() {
  return state.cart.reduce((s, i) => s + i.price * i.qty, 0);
}

function cartCount() {
  return state.cart.reduce((s, i) => s + i.qty, 0);
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, type) {
  let el = $('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('toast-error', 'toast-success');
  if (type) el.classList.add('toast-' + type);
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
}

/* ---------- products ---------- */
async function loadProducts() {
  const box = $('products');
  box.innerHTML = '<p class="loading">جاري تحميل المنتجات…</p>';
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.products = Array.isArray(data.products) ? data.products : [];

    if (!state.products.length) {
      box.innerHTML = '<p class="empty-state">لا توجد منتجات متاحة حالياً</p>';
      return;
    }

    box.innerHTML = '';
    state.products.forEach(p => box.appendChild(productCard(p)));
  } catch (err) {
    console.error('[products]', err);
    box.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    wrap.innerHTML = '<p>تعذّر تحميل المنتجات.</p>';
    const retry = document.createElement('button');
    retry.className = 'btn btn-secondary';
    retry.type = 'button';
    retry.textContent = 'إعادة المحاولة';
    retry.addEventListener('click', loadProducts);
    wrap.appendChild(retry);
    box.appendChild(wrap);
  }
}

function productCard(p) {
  const card = document.createElement('article');
  card.className = 'product-card';
  card.innerHTML =
    '<div class="product-header">' +
      '<h3>' + esc(p.name) + '</h3>' +
      (p.sku ? '<span class="product-sku">' + esc(p.sku) + '</span>' : '') +
    '</div>' +
    '<p class="product-description">' + esc(p.description || 'جودة عالية · خامات مختارة بعناية') + '</p>' +
    '<div class="product-price"><span class="price">' + money(p.price) + '</span> <span class="currency">ر.س</span></div>' +
    '<p class="product-note">بدون تسجيل · ادفع عند الاستلام</p>' +
    '<div class="product-actions"><button class="btn btn-primary btn-block" type="button">إضافة للسلة</button></div>';

  card.querySelector('button').addEventListener('click', function () {
    addToCart(p);
    this.textContent = 'تمت الإضافة ✓';
    this.disabled = true;
    setTimeout(() => { this.textContent = 'إضافة للسلة'; this.disabled = false; }, 1200);
  });
  return card;
}

/* ---------- cart ---------- */
function addToCart(p) {
  const found = state.cart.find(i => i.id === p.id);
  if (found) {
    found.qty = Math.min(999, found.qty + 1);
    toast('تم تحديث الكمية: ' + p.name, 'success');
  } else {
    state.cart.push({ id: p.id, name: p.name, price: Number(p.price) || 0, qty: 1 });
    toast('تمت إضافة: ' + p.name, 'success');
  }
  saveCart();
  renderCart();
}

function setQty(id, qty) {
  const item = state.cart.find(i => i.id === id);
  if (!item) return;
  const n = Math.min(999, Math.max(1, qty));
  item.qty = n;
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  state.cart = state.cart.filter(i => i.id !== id);
  saveCart();
  renderCart();
  toast('تم حذف المنتج');
}

function renderCart() {
  $('cartCount').textContent = '(' + cartCount() + ')';

  const list = $('cartItems');
  const summary = $('cartSummary');
  const checkoutBox = $('checkoutBox');

  if (!state.cart.length) {
    list.innerHTML = '<p class="empty-state">السلة فارغة — اختر منتجاتك من المتجر</p>';
    summary.hidden = true;
    checkoutBox.hidden = true;
    return;
  }

  list.innerHTML = '';
  state.cart.forEach(item => {
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML =
      '<div class="cart-item-info">' +
        '<strong>' + esc(item.name) + '</strong>' +
        '<span class="cart-item-price">' + money(item.price) + ' ر.س للقطعة</span>' +
      '</div>' +
      '<div class="qty-controls">' +
        '<button type="button" class="qty-btn" data-act="dec" aria-label="إنقاص الكمية">−</button>' +
        '<span class="qty-value">' + item.qty + '</span>' +
        '<button type="button" class="qty-btn" data-act="inc" aria-label="زيادة الكمية">+</button>' +
      '</div>' +
      '<div class="cart-item-total">' + money(item.price * item.qty) + ' ر.س</div>' +
      '<button type="button" class="btn-remove">حذف</button>';

    row.querySelector('[data-act="dec"]').addEventListener('click', () => setQty(item.id, item.qty - 1));
    row.querySelector('[data-act="inc"]').addEventListener('click', () => setQty(item.id, item.qty + 1));
    row.querySelector('.btn-remove').addEventListener('click', () => removeFromCart(item.id));
    list.appendChild(row);
  });

  $('cartTotal').textContent = money(cartTotal());
  summary.hidden = false;
}

/* ---------- checkout ---------- */
function openCheckout() {
  if (!state.cart.length) { toast('السلة فارغة', 'error'); return; }
  $('checkoutBox').hidden = false;
  $('checkoutBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('co-name').focus();
}

async function submitOrder() {
  const btn = $('submitOrderBtn');
  const customer = {
    name: $('co-name').value.trim(),
    phone: $('co-phone').value.trim(),
    city: $('co-city').value.trim(),
    address: $('co-address').value.trim(),
    email: $('co-email').value.trim(),
  };
  const note = $('co-note').value.trim();

  clearFieldErrors('checkoutBox');
  const missing = [];
  if (!customer.name) missing.push('co-name');
  if (!customer.phone) missing.push('co-phone');
  if (!customer.city) missing.push('co-city');
  if (!customer.address) missing.push('co-address');
  if (missing.length) {
    missing.forEach(id => markError(id));
    $(missing[0]).focus();
    toast('يرجى تعبئة الحقول المطلوبة', 'error');
    return;
  }
  if (!/^[0-9+\s-]{9,15}$/.test(customer.phone)) {
    markError('co-phone');
    $('co-phone').focus();
    toast('رقم الجوال غير صالح', 'error');
    return;
  }

  const payload = {
    customer,
    items: state.cart.map(i => ({ productId: i.id, quantity: i.qty })),
    note,
  };

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'جارٍ الإرسال…';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.status === 429) {
      toast('تم إرسال طلبات كثيرة. انتظر دقيقة ثم حاول مجدداً.', 'error');
      return;
    }
    if (!res.ok) {
      toast(data.error || 'تعذّر إتمام الطلب', 'error');
      return;
    }

    state.cart = [];
    saveCart();
    renderCart();
    showOrderSuccess(data);
  } catch (err) {
    console.error('[order]', err);
    toast('خطأ في الاتصال بالخادم', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function showOrderSuccess(data) {
  const box = $('orderSuccess');
  box.innerHTML =
    '<div class="success-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
    '</div>' +
    '<h2>تم استلام طلبك</h2>' +
    '<p class="order-ref">رقم الطلب: <strong>' + esc(data.orderName || '—') + '</strong></p>' +
    (data.invoiceName ? '<p class="order-ref">رقم الفاتورة: <strong>' + esc(data.invoiceName) + '</strong></p>' : '') +
    '<p class="order-total">الإجمالي: <strong>' + money(data.total) + ' ر.س</strong></p>' +
    '<p class="auth-subtitle">سنتواصل معك لتأكيد موعد التوصيل. الدفع عند الاستلام.</p>';
  box.hidden = false;
  $('checkoutBox').hidden = true;
  $('checkoutForm').reset();
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- field errors ---------- */
function markError(id) {
  const el = $(id);
  if (el) { el.classList.add('input-error'); el.setAttribute('aria-invalid', 'true'); }
}

function clearFieldErrors(scopeId) {
  const scope = scopeId ? $(scopeId) : document;
  if (!scope) return;
  scope.querySelectorAll('.input-error').forEach(el => {
    el.classList.remove('input-error');
    el.removeAttribute('aria-invalid');
  });
}

/* ---------- auth ---------- */
function toggleAuthForm(e) {
  e.preventDefault();
  const login = $('login-form');
  const reg = $('register-form');
  const showingLogin = !login.hidden;
  login.hidden = showingLogin;
  reg.hidden = !showingLogin;
  clearFieldErrors();
}

async function handleRegister() {
  const btn = $('registerBtn');
  const name = $('register-name').value.trim();
  const phone = $('register-phone').value.trim();
  const password = $('register-password').value;

  clearFieldErrors('register-form');
  if (!name) { markError('register-name'); toast('الاسم مطلوب', 'error'); return; }
  if (!phone) { markError('register-phone'); toast('رقم الهاتف مطلوب', 'error'); return; }
  if (password.length < 6) {
    markError('register-password');
    toast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
    return;
  }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'جارٍ التسجيل…';
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password }),
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem('auth_token', data.token);
      state.token = data.token;
      await refreshAuthUI();
      toast('تم إنشاء الحساب بنجاح', 'success');
    } else {
      toast(data.error || 'تعذّر إنشاء الحساب', 'error');
    }
  } catch (err) {
    toast('خطأ في الاتصال', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function handleLogin() {
  const btn = $('loginBtn');
  const phone = $('login-phone').value.trim();
  const password = $('login-password').value;

  clearFieldErrors('login-form');
  if (!phone) { markError('login-phone'); toast('رقم الهاتف مطلوب', 'error'); return; }
  if (!password) { markError('login-password'); toast('كلمة المرور مطلوبة', 'error'); return; }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'جارٍ الدخول…';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem('auth_token', data.token);
      state.token = data.token;
      await refreshAuthUI();
      toast('تم تسجيل الدخول', 'success');
    } else {
      toast(data.error || 'بيانات الدخول غير صحيحة', 'error');
    }
  } catch (err) {
    toast('خطأ في الاتصال', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function handleLogout() {
  localStorage.removeItem('auth_token');
  state.token = null;
  refreshAuthUI();
  toast('تم تسجيل الخروج');
}

async function refreshAuthUI() {
  const login = $('login-form');
  const reg = $('register-form');
  const info = $('user-info');

  if (!state.token) {
    login.hidden = false;
    reg.hidden = true;
    info.hidden = true;
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: 'Bearer ' + state.token },
    });
    if (!res.ok) throw new Error('invalid session');
    const data = await res.json();
    $('user-name').textContent = data.user?.name || 'مرحباً بك';
    $('user-phone').textContent = data.user?.phone || '—';
    login.hidden = true;
    reg.hidden = true;
    info.hidden = false;
    // prefill checkout
    if (!$('co-name').value) $('co-name').value = data.user?.name || '';
    if (!$('co-phone').value) $('co-phone').value = data.user?.phone || '';
  } catch {
    localStorage.removeItem('auth_token');
    state.token = null;
    login.hidden = false;
    reg.hidden = true;
    info.hidden = true;
  }
}

/* ---------- navigation ---------- */
function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const target = $(id);
  if (!target) return;
  target.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('active');
    b.removeAttribute('aria-current');
  });
  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-current', 'page');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section, btn));
  });

  $('goShopBtn').addEventListener('click', () => {
    const btn = document.querySelector('[data-section="shop"]');
    showSection('shop', btn);
  });

  $('checkoutBtn').addEventListener('click', openCheckout);
  $('submitOrderBtn').addEventListener('click', submitOrder);
  $('cancelCheckoutBtn').addEventListener('click', () => { $('checkoutBox').hidden = true; });

  $('loginBtn').addEventListener('click', handleLogin);
  $('registerBtn').addEventListener('click', handleRegister);
  $('logoutBtn').addEventListener('click', handleLogout);
  document.querySelectorAll('[data-toggle-auth]').forEach(a => a.addEventListener('click', toggleAuthForm));

  // Enter key submits forms
  ['login-phone', 'login-password'].forEach(id =>
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); }));
  ['register-name', 'register-phone', 'register-password'].forEach(id =>
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') handleRegister(); }));

  // Clear error styling on input
  document.querySelectorAll('.input').forEach(el =>
    el.addEventListener('input', () => {
      el.classList.remove('input-error');
      el.removeAttribute('aria-invalid');
    }));

  loadCart();
  renderCart();
  refreshAuthUI();
  loadProducts();
});
