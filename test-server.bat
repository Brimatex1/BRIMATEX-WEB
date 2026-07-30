@echo off
REM Batch Script لاختبار سيرفير بريماتكس على Windows Command Prompt

echo.
echo 🧪 اختبار سيرفير بريماتكس
echo ========================
echo.

REM فحص 1: Node.js
echo 1️⃣ فحص Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js غير مثبت!
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set nodeVersion=%%i
echo ✅ Node.js: %nodeVersion%
echo.

REM فحص 2: الملفات
echo 2️⃣ فحص الملفات المطلوبة...

if not exist "server.js" (
    echo ❌ server.js مفقود!
    pause
    exit /b 1
)
echo ✅ server.js

if not exist "src\server.js" (
    echo ❌ src\server.js مفقود!
    pause
    exit /b 1
)
echo ✅ src\server.js

if not exist "src\lib\auth.js" (
    echo ❌ src\lib\auth.js مفقود!
    pause
    exit /b 1
)
echo ✅ src\lib\auth.js

if not exist "src\lib\odoo.js" (
    echo ❌ src\lib\odoo.js مفقود!
    pause
    exit /b 1
)
echo ✅ src\lib\odoo.js

if not exist "src\lib\whatsapp.js" (
    echo ❌ src\lib\whatsapp.js مفقود!
    pause
    exit /b 1
)
echo ✅ src\lib\whatsapp.js

if not exist "src\public\index.html" (
    echo ❌ src\public\index.html مفقود!
    pause
    exit /b 1
)
echo ✅ src\public\index.html

if not exist "src\public\styles.css" (
    echo ❌ src\public\styles.css مفقود!
    pause
    exit /b 1
)
echo ✅ src\public\styles.css

if not exist "src\data\demo-products.json" (
    echo ❌ src\data\demo-products.json مفقود!
    pause
    exit /b 1
)
echo ✅ src\data\demo-products.json

echo.

REM فحص 3: بدء السيرفير
echo 3️⃣ بدء السيرفير...
echo.
echo 🌐 افتح المتصفح على: http://localhost:3000
echo 📊 للإيقاف، اضغط: Ctrl+C
echo.
echo ---
echo.

REM شغّل السيرفير
node server.js
pause
