# 🚀 النشر السريع (Quick Start)

**الوقت**: 30 دقيقة | **المتطلبات**: VPS + Odoo + Dومين

---

## 📋 قبل البدء

جهز هذه البيانات:
```
✅ رابط Odoo:           https://company.odoo.com
✅ اسم قاعدة البيانات:  company
✅ البريد الإلكتروني:   admin@company.com
✅ API Key:              (من Odoo Settings)
✅ اسم الدومين:        brimatex.com
```

---

## 🎯 الخطوات (Copy & Paste)

### الخطوة 1️⃣: التحضير (5 دقائق)

```bash
# تسجيل الدخول إلى VPS
ssh user@your_vps_ip

# تحميل السكريبت التلقائي
cd /home/$(whoami)
wget https://raw.githubusercontent.com/yourusername/brimatex-web/main/deploy.sh
chmod +x deploy.sh

# تشغيل التثبيت التلقائي
./deploy.sh
```

**ستطلب منك**:
- URL الـ Git (أو Enter للمحلي)
- بيانات Odoo
- اسم الدومين

---

### الخطوة 2️⃣: الإعدادات اليدوية (2 دقيقة)

إذا لم تستخدم السكريبت:

```bash
# التحديثات
sudo apt update && sudo apt upgrade -y

# Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# PM2
sudo npm install -g pm2

# Certbot
sudo apt install -y certbot python3-certbot-nginx

# استنساخ المشروع
git clone https://github.com/yourusername/brimatex-web.git
cd brimatex-web
```

---

### الخطوة 3️⃣: إعداد الموقع (3 دقائق)

```bash
# إنشاء ملف البيئة
cp .env.example .env

# تعديل البيانات (استبدل بياناتك)
nano .env
```

ملف `.env` يجب أن يحتوي:
```bash
PORT=3000
NODE_ENV=production

ODOO_URL=https://company.odoo.com
ODOO_DB=company
ODOO_USERNAME=admin@company.com
ODOO_API_KEY=your_api_key_here

# WhatsApp (اختياري)
# TWILIO_ACCOUNT_SID=...
# TWILIO_AUTH_TOKEN=...
```

**اضغط**: `Ctrl+X` ثم `Y` ثم `Enter` للحفظ

---

### الخطوة 4️⃣: تشغيل الموقع (2 دقيقة)

```bash
# بدء التطبيق
pm2 start server.js --name "brimatex" --env production
pm2 save

# تحقق من التشغيل
pm2 logs brimatex
# يجب أن تجد: "Odoo متصل" أو "وضع تجريبي"
```

اضغط `Ctrl+C` للخروج من السجلات

---

### الخطوة 5️⃣: إعداد Nginx و SSL (10 دقائق)

```bash
# استبدل "brimatex.com" بدومينك
DOMAIN="brimatex.com"

# إنشاء ملف Nginx
sudo tee /etc/nginx/sites-available/brimatex > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# تفعيل الموقع
sudo ln -sf /etc/nginx/sites-available/brimatex /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# إضافة SSL مجاني
sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --agree-tos --non-interactive --email admin@$DOMAIN
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

---

### الخطوة 6️⃣: ربط الدومين (5 دقائق)

اذهب لمسجل الدومين (GoDaddy, Namecheap, إلخ):

**أضف سجلات DNS**:

| النوع | الاسم | القيمة |
|------|------|--------|
| A | @ | IP_ADDRESS_YOUR_VPS |
| A | www | IP_ADDRESS_YOUR_VPS |

**احصل على IP الخاص بك**:
```bash
curl https://checkip.amazonaws.com
```

ثم انسخ الرقم الذي يظهر في سجلات DNS

---

### الخطوة 7️⃣: الاختبار النهائي (3 دقائق)

```bash
# انتظر 30 دقيقة لانتشار DNS ثم:
curl https://yourdomain.com
# يجب أن ترى HTML الموقع

# تحقق من API
curl https://yourdomain.com/api/health
# يجب أن ترى: {"ok": true}

# تحقق من المنتجات
curl https://yourdomain.com/api/products | jq '.products | length'
# يجب أن يظهر رقم (عدد المنتجات)
```

---

## ✅ اختبر الربط الكامل

1. **افتح الموقع**:
   ```
   https://brimatex.com
   ```

2. **ضع طلب تجريبي**:
   - المنتج: أي منتج
   - البيانات:
     ```
     الاسم: محمد
     الهاتف: 0501234567
     البريد: test@example.com
     المدينة: الرياض
     العنوان: اختبار
     ```
   - اضغط "تأكيد الطلب"

3. **اذهب إلى Odoo**:
   ```
   https://company.odoo.com
   ```
   - Sales > Orders
   - ابحث عن "محمد"
   - يجب أن ترى الطلب ✅

4. **تحقق من الفاتورة**:
   - اضغط على الطلب
   - اضغط "Invoices"
   - يجب أن ترى فاتورة جديدة ✅

---

## 🔧 الأوامر المهمة بعد النشر

```bash
# عرض الحالة
pm2 list

# عرض السجلات
pm2 logs brimatex

# إعادة تشغيل
pm2 restart brimatex

# إيقاف
pm2 stop brimatex

# حذف
pm2 delete brimatex

# المراقبة الحية
pm2 monit

# تحديث SSL
sudo certbot renew

# إعادة تشغيل Nginx
sudo systemctl restart nginx
```

---

## ⚠️ استكشاف الأخطاء

### "الموقع لا يفتح"
```bash
# تحقق من PM2
pm2 logs brimatex

# تحقق من Nginx
sudo systemctl status nginx
sudo nginx -t

# تحقق من المنفذ
sudo netstat -tlnp | grep 3000
```

### "Odoo لم يتصل"
```bash
# اختبر البيانات
curl -X POST https://company.odoo.com/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"call","params":{"service":"common","method":"login","args":["company","admin@company.com","api_key"]},"id":1}'

# إذا رجعت رقم = نجح
# إذا رجعت error = خطأ في البيانات
```

### "الدومين لا يعمل"
```bash
# تحقق من DNS
nslookup brimatex.com

# انتظر 30 دقيقة للانتشار
# ثم جرب مرة أخرى
```

---

## 📞 ملخص سريع

| الخطوة | الوقت | الأمر |
|------|------|-------|
| 1. التحديثات | 2 د | `sudo apt update && upgrade -y` |
| 2. التثبيت | 3 د | `./deploy.sh` |
| 3. البيئة | 1 د | `nano .env` |
| 4. الموقع | 1 د | `pm2 start server.js` |
| 5. Nginx | 5 د | `sudo certbot --nginx` |
| 6. الدومين | 30 د | انتظر انتشار DNS |
| 7. الاختبار | 2 د | اختبر طلب من الموقع |

**المجموع**: ~45 دقيقة

---

## 🎉 النتيجة النهائية

```
✅ https://brimatex.com يعمل
✅ متصل بـ Odoo
✅ رسائل WhatsApp تلقائية
✅ SSL آمن
✅ أداء عالي
```

---

**تم**: 29 يوليو 2026 | **الإصدار**: 1.0
