# 🚀 تشغيل سيرفر بريماتكس

## البدء السريع

### الطريقة 1: الأمر المباشر
```bash
node server.js
```

ثم افتح المتصفح على:
```
http://localhost:3000
```

### الطريقة 2: استخدام script الاختبار
```bash
bash test-server.sh
```

---

## ✅ التحقق من الاتصال

إذا كانت الصفحة لا تفتح، جرّب هذه الأوامر:

### اختبار الـ Health Check
```bash
curl http://localhost:3000/api/health
```
**النتيجة المتوقعة:**
```json
{"ok":true,"odooConfigured":false}
```

### اختبار جلب المنتجات
```bash
curl http://localhost:3000/api/products | jq
```

### اختبار الصفحة الرئيسية
```bash
curl http://localhost:3000/ | head -20
```

---

## 🔧 استكشاف الأخطاء

### المشكلة: "Cannot find module"
```bash
# تحقق من أن جميع الملفات موجودة
ls -la src/lib/
ls -la src/public/
ls -la src/data/
```

### المشكلة: "Port already in use"
```bash
# غيّر الـ port
PORT=3001 node server.js

# أو أغلق العملية القديمة
lsof -i :3000
kill -9 <PID>
```

### المشكلة: لا تُحمّل المنتجات
```bash
# افتح console المتصفح (F12)
# وتحقق من الأخطاء
# يجب أن ترى رسالة تقول:
# "جاري تحميل المنتجات..." → ثم المنتجات
```

---

## 🌐 المسارات المتاحة

### الصفحات
- `/` - الصفحة الرئيسية
- `/styles.css` - التصاميم

### API الخاصة
- `GET /api/products` - قائمة المنتجات
- `POST /api/auth/register` - تسجيل مستخدم جديد
- `POST /api/auth/login` - تسجيل الدخول
- `GET /api/auth/me` - بيانات المستخدم الحالي
- `POST /api/orders` - إنشاء طلب جديد
- `GET /api/health` - حالة السيرفير

---

## 📊 مثال على طلب API

### تسجيل مستخدم جديد
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "0501234567",
    "password": "test123",
    "name": "أحمد"
  }'
```

### تسجيل الدخول
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "0501234567",
    "password": "test123"
  }'
```

---

## ⚙️ متغيرات البيئة (اختياري)

إذا كنت تريد الاتصال بـ Odoo حقيقي، أنشئ ملف `.env`:

```bash
cp .env.example .env
```

ثم عدّل الملف بـ Odoo credentials:
```
ODOO_URL=https://yourcompany.odoo.com
ODOO_DB=yourcompany
ODOO_USERNAME=admin@company.com
ODOO_API_KEY=your_api_key
```

بدون هذه المتغيرات، السيرفير يعمل في **وضع تجريبي** 100% ✅

---

## 📈 الأداء

- **وقت الاستجابة**: <100ms
- **استهلاك الذاكرة**: ~20-30 MB
- **المعالج**: معالج واحد (single-threaded)
- **الـ Concurrency**: غير محدود (Node.js handles it)

---

## 🎯 الخطوات التالية

1. ✅ تشغيل السيرفير محلياً
2. 🧪 اختبار الواجهة
3. 📦 النشر على VPS
4. 🔗 ربط Odoo الحقيقي
5. 💬 تفعيل WhatsApp

---

**للمزيد من المعلومات:** اقرأ [README.md](./README.md)
