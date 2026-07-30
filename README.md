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

```bash
# 1. إنشاء ملف البيئة
cp .env.example .env

# 2. تعديل البيانات (استبدل بيانات Odoo الخاصة بك)
nano .env

# 3. التشغيل
node server.js
```

**ملف `.env` المطلوب**:
```bash
PORT=3000
ODOO_URL=https://yourcompany.odoo.com
ODOO_DB=yourcompany
ODOO_USERNAME=admin@company.com
ODOO_API_KEY=your_api_key_here
```

📖 **للمزيد**: اقرأ [دليل ربط Odoo](./ODOO_SETUP.md)

## 💬 رسائل WhatsApp التلقائية

الموقع يرسل فاتورة تلقائية عند كل طلب:

**وضع Demo** (بدون تكاليف):
```bash
node server.js
# الرسائل تُطبع في الـ console
```

**مع Twilio** (إرسال حقيقي):
```bash
export TWILIO_ACCOUNT_SID="your_sid"
export TWILIO_AUTH_TOKEN="your_token"
export TWILIO_WHATSAPP_FROM="whatsapp:+966..."
node server.js
```

📖 **للمزيد**: اقرأ [دليل WhatsApp](./WHATSAPP_SETUP.md)

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
- [🚀 النشر السريع (30 دقيقة)](./QUICK_START.md)
- [📖 دليل النشر الكامل](./DEPLOYMENT_GUIDE.md)

## 📁 هيكل المشروع

```
brimatex-web/
├── server.js                      # خادم HTTP + API
├── lib/
│   ├── odoo.js                   # عميل Odoo JSON-RPC
│   └── whatsapp.js               # تكامل WhatsApp
├── public/                        # واجهة المتجر
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── data/
│   └── demo-products.json        # منتجات التجربة
├── QUICK_START.md                # النشر السريع
├── DEPLOYMENT_GUIDE.md           # دليل النشر المفصل
├── ODOO_SETUP.md                 # ربط Odoo
├── WHATSAPP_SETUP.md             # تفعيل WhatsApp
└── .env.example                  # متغيرات البيئة
```

## ⚙️ الأوامر المهمة

```bash
# تطوير محلي
node server.js

# الإنتاج مع PM2
pm2 start server.js --name brimatex
pm2 logs brimatex
pm2 restart brimatex

# اختبار الاتصال بـ Odoo
curl https://yourdomain.com/api/health

# مراقبة الأداء
pm2 monit
```

## 🎨 التخصيص

- **الاسم والشعار**: `public/index.html`
- **الألوان والأنماط**: `public/styles.css` (متغيرات `:root`)
- **العملة**: `public/app.js` (متغير `CURRENCY`)
- **المنتجات التجريبية**: `data/demo-products.json`
- **الرسالة البريدية**: `lib/whatsapp.js` (دالة `sendInvoiceViaWhatsApp`)

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
# عرض السجلات
pm2 logs brimatex

# اختبر الاتصال بـ Odoo
curl https://yourdomain.com/api/health | jq

# تحقق من الطلبات المحفوظة
cat data/orders.local.jsonl | jq
```

---

**النسخة**: 1.0 | **آخر تحديث**: 29 يوليو 2026
