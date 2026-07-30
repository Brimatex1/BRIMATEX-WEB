# 🛏️ بريماتكس (BRIMATEX) — متجر المراتب الذكي

متجر إلكتروني متكامل بالعربية (RTL) لبيع المراتب وألواح الإسفنج والمخدات، يتكامل تماماً مع نظام أودو (Odoo).

## ✨ المزايا الرئيسية

✅ **تكامل Odoo كامل**
- جلب المنتجات تلقائياً من Odoo مع الأسعار والصور والمخزون
- إنشاء عملاء وأوامر بيع في Odoo تلقائياً
- إنشاء الفواتير والتتبع التلقائي

✅ **رسائل WhatsApp تلقائية**
- إرسال الفاتورة للعميل عبر WhatsApp عند تأكيد الطلب
- دعم Twilio للإرسال الفعلي
- وضع demo للاختبار بدون تكاليف

✅ **تصميم احترافي**
- واجهة عربية RTL بتصميم حديث
- تجاوب كامل (Responsive)
- أداء عالي (Gzip Compression)
- شهادة SSL HTTPS آمنة

✅ **بدون مكتبات خارجية**
- Node.js 18+ فقط
- خادم HTTP محسّن
- JSON-RPC client للتواصل مع Odoo

## 🚀 النشر السريع

للنشر على VPS مع Odoo + الدومين، اتبع:
- **[النشر السريع (30 دقيقة)](./QUICK_START.md)** — Copy & Paste أوامر
- **[دليل النشر الكامل](./DEPLOYMENT_GUIDE.md)** — شرح تفصيلي
- **[ربط Odoo](./ODOO_SETUP.md)** — كيفية الحصول على API Key

## ⚡ التشغيل الفوري (وضع تجريبي)

```bash
node server.js
```

ثم افتح: **http://localhost:3000**

## 🔗 الربط مع Odoo (خطوات سريعة)

**ملف `.env` المطلوب**:
```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Odoo Integration (اترك فارغ للوضع التجريبي)
ODOO_URL=https://yourcompany.odoo.com
ODOO_DB=yourcompany
ODOO_USERNAME=admin@company.com
ODOO_API_KEY=your_api_key_here

# WhatsApp Integration (اختياري)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_FROM=whatsapp:+966...
```

**خطوات الإعداد**:
```bash
# 1. إنشاء ملف البيئة
cp .env.example .env

# 2. تعديل البيانات (استبدل بيانات Odoo الخاصة بك)
nano .env

# 3. التشغيل
node server.js
```

📖 **للمزيد**: اقرأ [دليل ربط Odoo](./docs/ODOO_SETUP.md)

## 💬 رسائل WhatsApp التلقائية

الموقع يرسل فاتورة تلقائية عند كل طلب جديد.

**وضع Demo** (بدون تكاليف):
```bash
node server.js
# الرسائل تُطبع في console بدلاً من إرسالها
[WhatsApp Demo] Would send to +966501234567: ...
```

**مع Twilio** (إرسال حقيقي):
```bash
# إضافة بيانات Twilio في ملف .env
TWILIO_ACCOUNT_SID="ACxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your_token"
TWILIO_WHATSAPP_FROM="whatsapp:+966..."

# ثم تشغيل الخادم
node server.js
```

**الرسالة المرسلة:**
```
🧾 الفاتورة الخاصة بك من بريماتكس

رقم الطلب: DEMO-851095
رقم الفاتورة: INV-851095
الحالة: 📋 مسودة
المبلغ: 2900 ر.س

شكراً لاختيارك بريماتكس 🛏️
تجربة 100 ليلة · توصيل مجاني · ضمان حتى 12 سنة
```

📖 **للمزيد**: اقرأ [دليل WhatsApp](./docs/WHATSAPP_SETUP.md)

## واجهة API

| المسار | الطريقة | الوصف |
|--------|---------|-------|
| `/api/products` | GET | قائمة المنتجات (من أودو أو التجريبية) |
| `/api/products/:id/image` | GET | صورة المنتج من أودو |
| `/api/orders` | POST | إنشاء طلب — يُنشئ أمر بيع في أودو |
| `/api/health` | GET | حالة الخادم وهل أودو متصل |

### مثال طلب

```json
POST /api/orders
{
  "customer": { "name": "محمد", "phone": "0501234567", "city": "الرياض", "address": "حي النخيل" },
  "items": [{ "productId": 1, "quantity": 2 }],
  "note": "التوصيل مساءً"
}
```

الطلب يُنشأ في أودو كـ **عرض سعر (Quotation)** يمكن لفريق المبيعات تأكيده من لوحة أودو، وتظهر المقاسات المختارة في ملاحظات الطلب.

## 👤 إدارة المستخدمين والجلسات

تم إضافة نظام مدمج لإدارة حسابات المستخدمين وجلساتهم:

**المميزات:**
- ✅ تسجيل مستخدم جديد بالهاتف
- ✅ تسجيل دخول آمن بـ SHA256 hashing
- ✅ جلسات مؤقتة (30 يوم)
- ✅ إدارة العناوين والمفضلات
- ✅ تتبع الطلبات

**نقاط النهاية:**
```
POST   /api/auth/register      # تسجيل مستخدم جديد
POST   /api/auth/login         # تسجيل الدخول
GET    /api/auth/me            # بيانات المستخدم الحالي
POST   /api/auth/logout        # تسجيل الخروج
POST   /api/user/addresses     # إضافة عنوان
DELETE /api/user/addresses/:id # حذف عنوان
POST   /api/user/wishlist      # إضافة للمفضلة
DELETE /api/user/wishlist/:id  # حذف من المفضلة
```

## 📊 واجهة API

| المسار | الطريقة | الوصف |
|--------|---------|-------|
| `/api/products` | GET | قائمة المنتجات من Odoo |
| `/api/products/:id/image` | GET | صورة المنتج |
| `/api/orders` | POST | إنشاء طلب جديد |
| `/api/invoices/:id` | GET | حالة الفاتورة |
| `/api/health` | GET | حالة الخادم والاتصال |

**مثال طلب**:
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "name": "محمد علي",
      "phone": "0501234567",
      "email": "test@example.com",
      "city": "الرياض",
      "address": "حي النيل"
    },
    "items": [{"productId": 1, "quantity": 1, "size": "180x200"}],
    "note": "توصيل مساءً"
  }'
```

## 🌐 النشر على الإنترنت

### للنشر السريع (VPS):
```bash
bash deploy.sh
```

### يدوياً:
```bash
# تثبيت المتطلبات
sudo apt install -y nodejs nginx certbot

# تشغيل التطبيق
pm2 start server.js --name brimatex
pm2 save

# إعداد Nginx و SSL
sudo certbot --nginx -d yourdomain.com
```

📖 **دلائل النشر**:
- [🚀 النشر السريع (30 دقيقة)](./docs/QUICK_START.md)
- [📖 دليل النشر الكامل](./docs/DEPLOYMENT_GUIDE.md)

## 📁 هيكل المشروع

```
brimatex-web/
├── server.js                      # نقطة الدخول (يشغل src/server.js)
├── .env.example                   # متغيرات البيئة
├── src/
│   ├── server.js                 # خادم HTTP + API الرئيسي
│   ├── lib/
│   │   ├── odoo.js               # عميل Odoo JSON-RPC
│   │   ├── whatsapp.js           # تكامل WhatsApp (Twilio)
│   │   └── auth.js               # إدارة المستخدمين والجلسات
│   ├── public/                   # الملفات الثابتة (HTML/CSS)
│   │   ├── index.html            # واجهة المتجر
│   │   └── styles.css            # تصاميم وأنماط
│   └── data/
│       ├── demo-products.json    # منتجات التجربة
│       ├── users.jsonl           # بيانات المستخدمين
│       ├── sessions.jsonl        # جلسات المستخدمين
│       └── orders.local.jsonl    # سجل الطلبات المحلي
├── docs/
│   ├── QUICK_START.md            # النشر السريع
│   ├── DEPLOYMENT_GUIDE.md       # دليل النشر المفصل
│   ├── ODOO_SETUP.md             # ربط Odoo
│   └── WHATSAPP_SETUP.md         # تفعيل WhatsApp
└── data/
    └── demo-products.json        # منتجات التجربة (أصلية)
```

## 🛠️ التطوير المحلي

### البدء السريع:

```bash
# 1. استنساخ المشروع
git clone https://github.com/Brimatex1/BRIMATEX-WEB.git
cd BRIMATEX-WEB

# 2. إعداد ملف البيئة (اختياري - يعمل بدونه في وضع تجريبي)
cp .env.example .env

# 3. تشغيل الخادم
node server.js

# الموقع سيكون متاح على:
# http://localhost:3000
```

### مع Odoo:

```bash
# 1. تحديث ملف .env بيانات Odoo
cat > .env << EOF
PORT=3000
ODOO_URL=https://yourcompany.odoo.com
ODOO_DB=yourcompany
ODOO_USERNAME=admin@company.com
ODOO_API_KEY=your_api_key_here
EOF

# 2. تشغيل الخادم
node server.js
```

## ⚙️ الأوامر المهمة

```bash
# تطوير محلي
node server.js
# الموقع: http://localhost:3000

# تشغيل الخادم مع إعادة تحميل تلقائية (مع nodemon)
npx nodemon server.js

# الإنتاج مع PM2
pm2 start server.js --name brimatex
pm2 logs brimatex
pm2 restart brimatex
pm2 stop brimatex

# اختبار الاتصال بـ Odoo
curl http://localhost:3000/api/health | jq

# اختبار جلب المنتجات
curl http://localhost:3000/api/products | jq

# مراقبة الأداء
pm2 monit
```

## 🎨 التخصيص

- **الاسم والشعار**: `src/public/index.html`
- **الألوان والأنماط**: `src/public/styles.css` (متغيرات `:root`)
- **المنتجات التجريبية**: `src/data/demo-products.json`
- **رسالة WhatsApp**: `src/lib/whatsapp.js` (دالة `sendInvoiceViaWhatsApp`)
- **بيانات المستخدمين**: `src/data/users.jsonl` (تنسيق JSONL)

## 🔒 الأمان

- ✅ معالجة آمنة للطلبات (حد أقصى 100KB)
- ✅ تقليل معدل الطلبات (10 طلب/دقيقة/IP)
- ✅ التحقق من الصحة على الخادم
- ✅ رؤوس أمان (CSP, X-Frame-Options, etc.)
- ✅ لا تسرب معلومات حساسة

## 📈 الأداء

- ✅ Gzip compression للملفات الثابتة
- ✅ تخزين مؤقت للمنتجات (60 ثانية)
- ✅ Nginx reverse proxy
- ✅ HTTP/2 عبر SSL
- ✅ صور محسّنة

## 🚀 الميزات المخطط لها

- [ ] بوابة دفع إلكترونية (مدى/Tap/Moyasar)
- [ ] تتبع الطلب من Odoo
- [ ] رد الأموال التلقائية
- [ ] نظام تقييمات العملاء
- [ ] برنامج الإحالات
- [ ] رسائل تذكير الدفع عبر WhatsApp

## 📞 الدعم والمساعدة

```bash
# عرض السجلات (محلي)
node server.js

# عرض السجلات (الإنتاج)
pm2 logs brimatex

# اختبر الاتصال بـ Odoo
curl http://localhost:3000/api/health | jq

# تحقق من الطلبات المحفوظة
cat src/data/orders.local.jsonl | jq

# تحقق من المستخدمين المسجلين
cat src/data/users.jsonl | jq

# مسح بيانات المتجر التجريبي
rm src/data/users.jsonl src/data/sessions.jsonl
touch src/data/users.jsonl src/data/sessions.jsonl
```

## 🐛 استكشاف الأخطاء

**المشكلة**: الخادم لا يبدأ
```bash
# تحقق من إصدار Node.js (يجب أن يكون 18+)
node --version

# تحقق من المنافذ المشغولة
lsof -i :3000
```

**المشكلة**: لا تظهر المنتجات
```bash
# تحقق من .env إن كان مكتملاً
cat .env

# قم بتشغيل الخادم بدون .env (يستخدم demo mode)
rm .env
node server.js
```

---

**النسخة**: 1.1 | **آخر تحديث**: 30 يوليو 2026 | **الحالة**: ✅ جاهز للتطوير
