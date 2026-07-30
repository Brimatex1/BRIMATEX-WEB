#!/bin/bash
# اختبار شامل لـ BRIMATEX-WEB Server

echo "🧪 اختبار سيرفر بريماتكس"
echo "========================"
echo ""

# تحقق من Node.js
echo "1️⃣ فحص Node.js:"
node --version || { echo "❌ Node.js غير مثبت"; exit 1; }
echo ""

# تحقق من الملفات
echo "2️⃣ فحص الملفات:"
files=(
  "server.js"
  "src/server.js"
  "src/lib/auth.js"
  "src/lib/odoo.js"
  "src/lib/whatsapp.js"
  "src/public/index.html"
  "src/public/styles.css"
  "src/data/demo-products.json"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ $file مفقود"
    exit 1
  fi
done
echo ""

# تشغيل السيرفير
echo "3️⃣ تشغيل السيرفير..."
echo "افتح المتصفح على: http://localhost:3000"
echo ""

# اظهر الإخراج
node server.js
