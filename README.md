// Storefront logic: product listing, cart (localStorage), checkout via /api/orders.

const CURRENCY = 'ر.س';

// SVG placeholder art per category (Lucide outline paths) — no emoji icons.
const ICON_PATHS = {
  bed: '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  pillow: '<path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z"/><path d="M5 18v2"/><path d="M19 18v2"/>',
};
const CATEGORY_ICONS = {
  'مراتب طبية': 'bed',
  'مراتب إسفنج': 'bed',
  'مراتب أطفال': 'bed',
  'ألواح إسفنج': 'layers',
  'مخدات': 'pillow',
  'قواعد أسرّة': 'bed',
};

function categoryArt(category) {
  const paths = ICON_PATHS[CATEGORY_ICONS[category]] || ICON_PATHS.bed;
  const span = document.createElement('span');
  span.className = 'placeholder-art';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  return span;
}

let allProducts = [];
let activeCategory = null;
let cart = loadCart();

const $ = (id) => document.getElementById(id);

function loadCart() {
  try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
}
function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
  renderCart();
}

function fmt(n) {
  return Number(n).toLocaleString('ar-SA');
}

function starString(rating) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// --- Products ---------------------------------------------------------------

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    allProducts = data.products;
    if (data.source === 'demo') {
      const badge = $('source-badge');
      badge.textContent = 'وضع تجريبي — لم يتم ربط أودو بعد';
      badge.hidden = false;
    }
    renderCategories();
    renderProducts();
    renderCompareTable();
  } catch {
    $('product-grid').innerHTML = '<p class="loading">تعذر تحميل المنتجات، حاول تحديث الصفحة.</p>';
  }
}

function renderCategories() {
  const categories = [...new Set(allProducts.map((p) => p.category).filter(Boolean))];
  const nav = $('category-nav');
  nav.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.textContent = 'الكل';
  allBtn.className = activeCategory === null ? 'active' : '';
  allBtn.onclick = () => { activeCategory = null; renderCategories(); renderProducts(); };
  nav.appendChild(allBtn);
  for (const cat of categories) {
    const btn = document.createElement('button');
    btn.textContent = cat;
    btn.className = activeCategory === cat ? 'active' : '';
    btn.onclick = () => { activeCategory = cat; renderCategories(); renderProducts(); };
    nav.appendChild(btn);
  }
}

function renderProducts() {
  const grid = $('product-grid');
  const products = activeCategory
    ? allProducts.filter((p) => p.category === activeCategory)
    : allProducts;
  grid.innerHTML = '';
  if (!products.length) {
    grid.innerHTML = '<p class="loading">لا توجد منتجات في هذا التصنيف.</p>';
    return;
  }
  for (const p of products) grid.appendChild(productCard(p));
}

function productCard(p) {
  const card = document.createElement('div');
  card.className = 'card';

  // Image block with optional badge
  const img = document.createElement('div');
  img.className = 'card-img';
  if (p.image) {
    const el = document.createElement('img');
    el.src = p.image;
    el.alt = p.name;
    el.loading = 'lazy';
    el.onerror = () => {
      el.remove();
      img.appendChild(categoryArt(p.category));
    };
    img.appendChild(el);
  } else {
    img.appendChild(categoryArt(p.category));
  }
  if (p.badge) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = p.badge;
    img.appendChild(badge);
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = p.name;
  body.appendChild(title);

  if (p.rating) {
    const rating = document.createElement('div');
    rating.className = 'rating-row';
    rating.innerHTML = `<span class="stars">${starString(p.rating)}</span> ${p.rating} (${fmt(p.reviews || 0)} تقييم)`;
    body.appendChild(rating);
  }

  const desc = document.createElement('p');
  desc.className = 'card-desc';
  desc.textContent = p.description || '';
  body.appendChild(desc);

  if (p.firmness != null) {
    const feel = document.createElement('div');
    feel.className = 'feel-row';
    feel.innerHTML = `الإحساس: <strong>${p.feel || ''}</strong>
      <div class="firmness"><span class="firmness-dot" style="right:${p.firmness}%"></span></div>
      <div class="firmness-labels"><span>ناعمة</span><span>متوسطة</span><span>صلبة</span></div>`;
    body.appendChild(feel);
  }

  if (Array.isArray(p.features) && p.features.length) {
    const ul = document.createElement('ul');
    ul.className = 'card-features';
    for (const f of p.features) {
      const li = document.createElement('li');
      li.textContent = f;
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  let selectedSize = null;
  if (Array.isArray(p.sizes) && p.sizes.length) {
    const sizes = document.createElement('div');
    sizes.className = 'card-sizes';
    p.sizes.forEach((size, i) => {
      const chip = document.createElement('button');
      chip.className = 'size-chip' + (i === 0 ? ' selected' : '');
      chip.textContent = size;
      chip.onclick = () => {
        selectedSize = size;
        sizes.querySelectorAll('.size-chip').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
      };
      sizes.appendChild(chip);
    });
    selectedSize = p.sizes[0];
    body.appendChild(sizes);
  }

  const priceRow = document.createElement('div');
  priceRow.className = 'price-row';
  const label = document.createElement('span');
  label.className = 'price-label';
  label.textContent = 'ابتداءً من';
  const price = document.createElement('span');
  price.className = 'price' + (p.oldPrice ? ' on-sale' : '');
  price.innerHTML = `${fmt(p.price)} <small>${CURRENCY}</small>`;
  priceRow.append(label, price);
  if (p.oldPrice) {
    const old = document.createElement('span');
    old.className = 'old-price';
    old.textContent = fmt(p.oldPrice);
    priceRow.appendChild(old);
  }
  body.appendChild(priceRow);

  const installment = document.createElement('p');
  installment.className = 'installment';
  installment.textContent = `أو 4 دفعات × ${fmt(Math.ceil(p.price / 4))} ${CURRENCY} بدون فوائد`;
  body.appendChild(installment);

  if (p.inStock === false) {
    const oos = document.createElement('div');
    oos.className = 'out-of-stock';
    oos.textContent = 'نفذت الكمية — قريباً';
    body.appendChild(oos);
  } else {
    const btn = document.createElement('button');
    btn.className = 'btn btn-dark btn-block add-btn';
    btn.textContent = 'أضف للسلة';
    btn.onclick = () => addToCart(p, selectedSize);
    body.appendChild(btn);
    const micro = document.createElement('p');
    micro.className = 'cta-microcopy';
    micro.textContent = 'توصيل مجاني · تجربة 100 ليلة';
    body.appendChild(micro);
  }

  card.append(img, body);
  return card;
}

function renderCompareTable() {
  const table = $('compare-table');
  if (!table) return;
  const mattresses = allProducts.filter((p) => p.firmness != null && /مرتبة|مراتب/.test(p.category + p.name)).slice(0, 4);
  if (mattresses.length < 2) {
    document.getElementById('compare').hidden = true;
    return;
  }
  const rows = [
    ['الإحساس', (p) => p.feel || '—'],
    ['التقييم', (p) => `★ ${p.rating} (${fmt(p.reviews || 0)})`],
    ['السعر', (p) => `${fmt(p.price)} ${CURRENCY}`],
    ['أبرز ميزة', (p) => (p.features && p.features[0]) || '—'],
  ];
  table.innerHTML = '';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th'));
  for (const m of mattresses) {
    const th = document.createElement('th');
    th.textContent = m.name;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const [label, fn] of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = label;
    tr.appendChild(th);
    for (const m of mattresses) {
      const td = document.createElement('td');
      td.textContent = fn(m);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

// --- Cart -------------------------------------------------------------------

function addToCart(product, size) {
  const key = `${product.id}::${size || ''}`;
  const existing = cart.find((i) => i.key === key);
  if (existing) existing.quantity += 1;
  else cart.push({ key, productId: product.id, name: product.name, price: product.price, size: size || null, quantity: 1 });
  saveCart();
  openCart();
}

function renderCart() {
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  $('cart-count').textContent = fmt(count);
  const container = $('cart-items');
  container.innerHTML = '';
  if (!cart.length) {
    container.innerHTML = '<p class="cart-empty">سلتك فارغة</p>';
  }
  for (const item of cart) {
    const row = document.createElement('div');
    row.className = 'cart-item';
    const info = document.createElement('div');
    info.className = 'cart-item-info';
    info.innerHTML = `
      <div class="cart-item-name"></div>
      <div class="cart-item-size"></div>
      <div class="cart-item-price">${fmt(item.price * item.quantity)} ${CURRENCY}</div>`;
    info.querySelector('.cart-item-name').textContent = item.name;
    info.querySelector('.cart-item-size').textContent = item.size ? `المقاس: ${item.size}` : '';
    const controls = document.createElement('div');
    controls.className = 'qty-controls';
    const minus = document.createElement('button');
    minus.textContent = '−';
    minus.onclick = () => { item.quantity -= 1; if (item.quantity <= 0) cart = cart.filter((i) => i !== item); saveCart(); };
    const qty = document.createElement('span');
    qty.textContent = fmt(item.quantity);
    const plus = document.createElement('button');
    plus.textContent = '+';
    plus.onclick = () => { item.quantity += 1; saveCart(); };
    controls.append(plus, qty, minus);
    const remove = document.createElement('button');
    remove.className = 'remove-btn';
    remove.textContent = 'حذف';
    remove.onclick = () => { cart = cart.filter((i) => i !== item); saveCart(); };
    row.append(info, controls, remove);
    container.appendChild(row);
  }
  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  $('cart-total').textContent = fmt(total);
  $('checkout-btn').disabled = !cart.length;
}

function openCart() {
  $('cart-drawer').hidden = false;
  $('overlay').hidden = false;
}
function closeCart() {
  $('cart-drawer').hidden = true;
  $('overlay').hidden = true;
}

// --- Checkout ---------------------------------------------------------------

function openCheckout() {
  closeCart();
  $('checkout-modal').hidden = false;
  $('checkout-form').hidden = false;
  $('order-success').hidden = true;
}
function closeCheckout() {
  $('checkout-modal').hidden = true;
}

async function submitOrder(e) {
  e.preventDefault();
  const form = e.target;
  const btn = $('submit-order');
  btn.disabled = true;
  btn.textContent = 'جارٍ إرسال الطلب…';

  const fd = new FormData(form);
  const payload = {
    customer: {
      name: fd.get('name').trim(),
      phone: fd.get('phone').trim(),
      email: fd.get('email').trim(),
      city: fd.get('city').trim(),
      address: fd.get('address').trim(),
    },
    items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    note: [
      fd.get('note').trim(),
      ...cart.filter((i) => i.size).map((i) => `${i.name} — المقاس: ${i.size} × ${i.quantity}`),
    ].filter(Boolean).join('\n'),
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل إرسال الطلب');
    cart = [];
    saveCart();
    form.reset();
    form.hidden = true;
    $('order-number').textContent = data.orderName || data.orderId;
    $('order-success').hidden = false;
  } catch (err) {
    alert(err.message || 'حدث خطأ، حاول مرة أخرى');
  } finally {
    btn.disabled = false;
    btn.textContent = 'تأكيد الطلب';
  }
}

// --- Init -------------------------------------------------------------------

$('year').textContent = new Date().getFullYear();
$('cart-button').onclick = openCart;
$('close-cart').onclick = closeCart;
$('overlay').onclick = closeCart;
$('checkout-btn').onclick = openCheckout;
$('close-checkout').onclick = closeCheckout;
$('checkout-form').onsubmit = submitOrder;
$('continue-shopping').onclick = () => { closeCheckout(); };
renderCart();
loadProducts();
