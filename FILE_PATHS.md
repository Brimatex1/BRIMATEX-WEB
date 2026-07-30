# 📍 خريطة مسارات الملفات الدقيقة

## 🎯 المسارات المهمة

### 1. نقطة الدخول (Entry Point)

```
server.js (في الجذر)
    ↓
    require('./src/server.js')
```

**المسار الفعلي للملف:**
```
server.js
│
└── src/server.js  (السيرفير الحقيقي)
```

---

### 2. مسارات المكتبات (Libraries)

عند تشغيل `src/server.js`:

```javascript
const odoo = require('./lib/odoo');
// يبحث عن: src/lib/odoo.js ✅

const whatsapp = require('./lib/whatsapp');
// يبحث عن: src/lib/whatsapp.js ✅

const auth = require('./lib/auth');
// يبحث عن: src/lib/auth.js ✅
```

**الملفات الموجودة:**
```
src/lib/
├── auth.js       ✅
├── odoo.js       ✅
└── whatsapp.js   ✅
```

---

### 3. مسارات الملفات الثابتة (Static Files)

عند طلب `/` أو `/styles.css`:

```javascript
const PUBLIC_DIR = path.join(__dirname, 'public');
// __dirname = src/
// المجلد المتوقع: src/public/ ✅
```

**الملفات الموجودة:**
```
src/public/
├── index.html    ✅ (عند طلب /)
└── styles.css    ✅ (عند طلب /styles.css)
```

---

### 4. مسارات البيانات (Data)

عند تحميل البيانات:

```javascript
fs.readFileSync(path.join(__dirname, 'data', 'demo-products.json'), 'utf8')
// المجلد المتوقع: src/data/ ✅

const ORDERS_LOG = path.join(__dirname, 'data', 'orders.local.jsonl');
// المجلد المتوقع: src/data/ ✅
```

**الملفات الموجودة:**
```
src/data/
├── demo-products.json     ✅ (المنتجات التجريبية)
├── users.jsonl            ✅ (بيانات المستخدمين)
├── sessions.jsonl         ✅ (جلسات المستخدمين)
└── orders.local.jsonl     ✅ (السجل المحلي)
```

---

## 🔍 تتبع الطلب (Request Tracing)

### عندما تطلب: `http://localhost:3000/`

```
1. يصل الطلب للسيرفير
   ↓
2. server.js يقول: require('./src/server.js')
   ↓
3. src/server.js يتحقق من المسار
   ↓
4. المسار (/) → serveStatic('/') 
   ↓
5. يبحث عن: src/public/index.html
   ↓
6. يُقرأ الملف ويُرسل ✅
   ↓
7. المتصفح يستقبل HTML ويعرضها
```

---

### عندما تطلب: `http://localhost:3000/styles.css`

```
1. يصل الطلب للسيرفير
   ↓
2. server.js يقول: require('./src/server.js')
   ↓
3. src/server.js يتحقق من المسار
   ↓
4. المسار (/styles.css) → serveStatic('/styles.css')
   ↓
5. يبحث عن: src/public/styles.css
   ↓
6. يُقرأ الملف ويُرسل ✅
   ↓
7. المتصفح يستقبل CSS ويطبقها
```

---

### عندما تطلب: `http://localhost:3000/api/products`

```
1. يصل الطلب للسيرفير
   ↓
2. server.js يقول: require('./src/server.js')
   ↓
3. src/server.js يتحقق إذا كان /api/
   ↓
4. نعم! يذهب إلى handleApi()
   ↓
5. يقرأ demo-products.json من: src/data/demo-products.json
   ↓
6. يُرسل JSON بـ 6 منتجات ✅
   ↓
7. المتصفح يستقبل البيانات ويعرضها
```

---

## ⚙️ كود مهم لتتبع المسارات

### في `src/server.js`:

```javascript
// السطر 18:
const PUBLIC_DIR = path.join(__dirname, 'public');
// __dirname = مجلد src/ (لأننا داخل src/server.js)
// PUBLIC_DIR = src/public/ ✅

// السطر 20:
const DEMO_PRODUCTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'demo-products.json'), 'utf8')
);
// يبحث عن: src/data/demo-products.json ✅

// السطر 22:
const ORDERS_LOG = path.join(__dirname, 'data', 'orders.local.jsonl');
// يبحث عن: src/data/orders.local.jsonl ✅
```

### في `src/server.js` - دالة serveStatic:

```javascript
// السطر 439:
function serveStatic(res, urlPath) {
  // تبني المسار: src/public/ + urlPath
  // مثال: urlPath = '/' → src/public/index.html
  // مثال: urlPath = '/styles.css' → src/public/styles.css
  
  let filePath = path.join(PUBLIC_DIR, safePath === '/' ? 'index.html' : safePath);
  // تأكد أن الملف موجود
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, 'index.html'); // اضطراري
  }
}
```

---

## ✅ قائمة تحقق المسارات

قبل التشغيل، تحقق من جميع هذه الملفات:

```powershell
# 1. نقطة الدخول
Test-Path server.js                    # يجب أن ترى: True
Test-Path src\server.js                # يجب أن ترى: True

# 2. المكتبات
Test-Path src\lib\auth.js              # يجب أن ترى: True
Test-Path src\lib\odoo.js              # يجب أن ترى: True
Test-Path src\lib\whatsapp.js          # يجب أن ترى: True

# 3. الملفات الثابتة
Test-Path src\public\index.html        # يجب أن ترى: True
Test-Path src\public\styles.css        # يجب أن ترى: True

# 4. البيانات
Test-Path src\data\demo-products.json  # يجب أن ترى: True
Test-Path src\data\users.jsonl         # يجب أن ترى: True
Test-Path src\data\sessions.jsonl      # يجب أن ترى: True
Test-Path src\data\orders.local.jsonl  # يجب أن ترى: True
```

إذا كانت أي واحدة `False`، فالمسارات غير صحيحة! ❌

---

## 🐛 تصحيح الأخطاء

### الخطأ: "Cannot find module './lib/auth'"

**السبب:** المجلد `src/` غير موجود أو المسارات غير صحيحة
**الحل:** تأكد من:
```
server.js (في الجذر)
src/
├── server.js
└── lib/
    └── auth.js
```

### الخطأ: "ENOENT: no such file or directory 'src/public/index.html'"

**السبب:** مجلد `src/public/` لا يحتوي على `index.html`
**الحل:** تأكد من:
```
src/public/
├── index.html
└── styles.css
```

### الخطأ: "Cannot GET /"

**السبب:** دالة `serveStatic` لا تجد الملفات
**الحل:** تحقق من:
1. هل `index.html` موجود في `src/public/`؟
2. هل كود `serveStatic` صحيح؟
3. هل لا توجد مسافات في أسماء الملفات؟

---

## 📝 ملخص

| المسار | النوع | المكان |
|--------|------|-------|
| `server.js` | Entry Point | جذر المشروع |
| `src/server.js` | Main Server | داخل src/ |
| `src/lib/*.js` | Libraries | داخل src/lib/ |
| `src/public/index.html` | Homepage | داخل src/public/ |
| `src/public/styles.css` | Styles | داخل src/public/ |
| `src/data/*.json*` | Data Files | داخل src/data/ |

**المفهوم الأساسي:**
- `server.js` (الجذر) ← `require('./src/server.js')`
- `src/server.js` يستخدم `__dirname` الذي = `src/`
- كل المسارات النسبية من `src/` ✅

---

الآن كل شيء واضح تماماً! 🎯
