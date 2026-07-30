# 🪟 دليل تشغيل السيرفير على Windows

## ⚠️ المشاكل الشائعة على Windows

### المشكلة 1: الأوامر العربية لا تعمل
```powershell
❌ رر  # هذا لن يعمل!
✅ node server.js  # هذا صحيح
```

### المشكلة 2: أوامر Linux لا تعمل على Windows PowerShell
```powershell
❌ ls -la  # قد لا تعمل
✅ dir    # هذا صحيح على Windows
```

---

## 🚀 الخطوات الصحيحة للتشغيل على Windows

### الخطوة 1: افتح Command Prompt أو PowerShell

**اختر واحد:**
- `cmd.exe` (Command Prompt - مفضّل للبسيط)
- `PowerShell` (أقوى وأكثر مرونة)

### الخطوة 2: انتقل إلى مجلد المشروع

```powershell
# إذا كان المشروع على C:\Users\YourName\Desktop\BRIMATEX-WEB
cd C:\Users\YourName\Desktop\BRIMATEX-WEB

# أو إذا كنت في نفس المجلد بالفعل
dir  # شوف الملفات
```

### الخطوة 3: تحقق من Node.js

```powershell
node --version
# يجب أن ترى: v18.x.x أو أعلى
```

### الخطوة 4: شغّل السيرفير

```powershell
node server.js
```

**يجب أن ترى هذا:**
```
متجر المراتب يعمل على http://localhost:3000 — وضع تجريبي (بدون أودو)
```

### الخطوة 5: افتح المتصفح

ببساطة انسخ هذا في شريط العنوان:
```
http://localhost:3000
```

---

## 🔍 اختبار كل مسار بدقة

### اختبار 1: هل السيرفير يعمل؟

**في PowerShell جديد:**
```powershell
curl http://localhost:3000/api/health

# النتيجة المتوقعة:
# {"ok":true,"odooConfigured":false}
```

### اختبار 2: هل المنتجات تُحمّل؟

```powershell
curl http://localhost:3000/api/products

# يجب أن ترى JSON بـ 6 منتجات
```

### اختبار 3: هل الصفحة الرئيسية تحمّل؟

```powershell
curl http://localhost:3000/

# يجب أن ترى HTML بـ <!DOCTYPE html>
```

### اختبار 4: هل CSS تحمّل؟

```powershell
curl http://localhost:3000/styles.css

# يجب أن ترى CSS بـ { margin: 0; ...}
```

---

## ⚠️ حل المشاكل الشائعة على Windows

### المشكلة: "Port 3000 is already in use"

```powershell
# اقتل العملية على Port 3000
netstat -ano | findstr :3000

# سيُظهر PID مثل: 12345
taskkill /PID 12345 /F

# أو شغّل على port مختلف
$env:PORT=3001
node server.js
```

### المشكلة: "Cannot find module"

```powershell
# تحقق من أن الملفات موجودة
dir src\lib\
dir src\public\
dir src\data\

# يجب أن ترى:
# auth.js, odoo.js, whatsapp.js
# index.html, styles.css
# demo-products.json, users.jsonl, ...
```

### المشكلة: "The system cannot find the path specified"

```powershell
# تأكد أنك في المجلد الصحيح
cd BRIMATEX-WEB
dir

# يجب أن ترى:
# server.js, src, .github, README.md, ...
```

### المشكلة: curl لا يعمل

استخدم `Invoke-WebRequest` بدلاً منها:

```powershell
# بدلاً من: curl http://localhost:3000/api/health
Invoke-WebRequest -Uri http://localhost:3000/api/health | Select-Object -ExpandProperty Content

# أو قصّر الاسم
iwr http://localhost:3000/api/health | Select-Object -ExpandProperty Content
```

---

## 📂 هيكل الملفات على Windows

يجب أن تبدو هكذا:

```
C:\...\BRIMATEX-WEB\
├── server.js                    ← نقطة الدخول
├── src\
│   ├── server.js              ← السيرفير الفعلي
│   ├── lib\
│   │   ├── auth.js
│   │   ├── odoo.js
│   │   └── whatsapp.js
│   ├── public\
│   │   ├── index.html         ← الصفحة الرئيسية
│   │   └── styles.css         ← التصاميم
│   └── data\
│       ├── demo-products.json
│       ├── users.jsonl
│       ├── sessions.jsonl
│       └── orders.local.jsonl
└── .env.example
```

---

## ✅ التشغيل الكامل (Copy & Paste)

**افتح PowerShell واكتب:**

```powershell
# 1. انتقل للمشروع
cd C:\Users\YourName\Desktop\BRIMATEX-WEB

# 2. تحقق من Node.js
node --version

# 3. تحقق من الملفات
dir src

# 4. شغّل السيرفير
node server.js

# ستراه:
# متجر المراتب يعمل على http://localhost:3000 — وضع تجريبي (بدون أودو)
```

**ثم:**
1. افتح Firefox أو Chrome
2. اكتب في العنوان: `http://localhost:3000`
3. شوف الصفحة 🎉

---

## 🎯 الخطوات التالية إذا عمل

```powershell
# اختبر تسجيل مستخدم جديد
$body = @{
    phone = "0501234567"
    password = "test123"
    name = "أحمد"
} | ConvertTo-Json

Invoke-WebRequest -Uri http://localhost:3000/api/auth/register `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

---

## 📞 إذا لم ينجح

أخبرني:
1. ماذا ترى عند تشغيل: `node server.js`
2. ماذا ترى عند كتابة: `node --version`
3. هل المجلد `src/` موجود؟
4. هل الملفات داخل `src/lib/` و `src/public/` موجودة؟

---

**النقطة الأساسية:** Windows لا يفهم الأوامر العربية مثل "رر" - استخدم فقط الأوامر الانجليزية! 🚀
