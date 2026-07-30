# PowerShell Script لاختبار سيرفير بريماتكس على Windows

Write-Host "🧪 اختبار سيرفير بريماتكس" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""

# فحص 1: Node.js
Write-Host "1️⃣ فحص Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version
if ($?) {
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Node.js غير مثبت!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# فحص 2: الملفات
Write-Host "2️⃣ فحص الملفات المطلوبة..." -ForegroundColor Yellow
$files = @(
    "server.js",
    "src\server.js",
    "src\lib\auth.js",
    "src\lib\odoo.js",
    "src\lib\whatsapp.js",
    "src\public\index.html",
    "src\public\styles.css",
    "src\data\demo-products.json"
)

$allFound = $true
foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "✅ $file" -ForegroundColor Green
    } else {
        Write-Host "❌ $file مفقود!" -ForegroundColor Red
        $allFound = $false
    }
}

if (-not $allFound) {
    Write-Host ""
    Write-Host "❌ بعض الملفات مفقودة!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# فحص 3: بدء السيرفير
Write-Host "3️⃣ بدء السيرفير..." -ForegroundColor Yellow
Write-Host ""
Write-Host "🌐 افتح المتصفح على: http://localhost:3000" -ForegroundColor Cyan
Write-Host "📊 للإيقاف، اضغط: Ctrl+C" -ForegroundColor Cyan
Write-Host ""
Write-Host "---" -ForegroundColor Gray

# شغّل السيرفير
node server.js
