# واجهة BRIMATEX — React + Tailwind + shadcn/ui

## البنية

```
BRIMATEX-WEB-main/
├── server.js              نقطة تشغيل الخادم
├── package.json           أوامر المشروع
├── src/                   الخادم (Node بلا تبعيات)
│   ├── server.js          توجيه API وخدمة الملفات
│   ├── lib/               odoo · whatsapp · auth
│   ├── data/              المنتجات والطلبات والمستخدمون
│   └── public/            ← ناتج البناء (يُولَّد تلقائياً)
├── web/                   الواجهة (React)
│   ├── src/
│   │   ├── components/ui/ مكوّنات shadcn/ui
│   │   ├── components/    أقسام التطبيق
│   │   ├── hooks/         useCart · useAuth
│   │   ├── lib/           api · utils
│   │   └── types.ts
│   └── vite.config.ts
├── tests/
│   ├── smoke.test.js      الخادم + ناتج البناء
│   └── frontend.check.js  كود الواجهة
└── legacy/                النسخة السابقة (HTML/CSS/JS خام)
```

## التشغيل

### أول مرة

```powershell
cd C:\Users\mbour\Downloads\BRIMATEX-WEB-main
npm run setup     # تثبيت حزم الواجهة (مرة واحدة، بضع دقائق)
npm run build     # بناء الواجهة إلى src/public
npm start         # تشغيل الموقع على http://localhost:3000
```

### أثناء التطوير

نافذتان في PowerShell:

```powershell
# النافذة الأولى — الخادم
npm run dev:api

# النافذة الثانية — الواجهة مع إعادة التحميل الفوري
npm run dev:web
```

ثم افتح **http://localhost:5173** (يُمرِّر `/api` تلقائياً إلى الخادم على المنفذ 3000).

### قبل النشر

```powershell
npm run build     # بناء الإنتاج
npm start         # يخدم كل شيء من المنفذ 3000
```

## الاختبارات

```powershell
npm test                        # الخادم وواجهات API وناتج البناء
node tests\frontend.check.js    # كود الواجهة: الاستيرادات والوصول والمنطق
npm run typecheck               # فحص أنواع TypeScript (بعد npm run setup)
```

## نظام التصميم

الألوان معرَّفة كمتغيرات CSS في `web/src/index.css` ومربوطة في `web/tailwind.config.js`.
لتغيير الهوية البصرية، عدّل المتغيرات فقط — كل المكوّنات تتبعها تلقائياً.

| الرمز | الاستخدام | الوضع الفاتح |
|-------|-----------|--------------|
| `--primary` | الأزرار والعناوين | بني داكن |
| `--accent` | التمييز والأسعار | ذهبي |
| `--background` | خلفية الصفحة | أبيض دافئ |
| `--muted-foreground` | نص ثانوي | رمادي |
| `--destructive` | الأخطاء والحذف | أحمر |
| `--success` | التأكيدات | أخضر |

الوضع الداكن جاهز: أضف `class="dark"` على `<html>`.

**الخطوط:** Cormorant للعناوين، Montserrat للنصوص — تُحمَّل من Google Fonts.

## إضافة مكوّن shadcn جديد

```powershell
cd web
npx shadcn@latest add dialog
```

أو انسخ المكوّن يدوياً إلى `web/src/components/ui/`. الإعدادات في `components.json`.

## ملاحظات مهمة

**سياسة الأمان (CSP):** الخادم يرسل `script-src 'self'`، لذا لا يعمل أي JavaScript مضمّن
داخل HTML. هذا سبب ضبط `modulePreload.polyfill: false` في `vite.config.ts` — لمنع Vite
من حقن سكربت مضمّن. عند إضافة نطاق خارجي جديد (خطوط، صور، واجهات)، أضفه إلى ترويسة
CSP في `src/server.js`.

**التخزين المؤقت:** ملفات `/assets/` تحمل بصمة في أسمائها وتُخزَّن سنة كاملة، بينما
`index.html` لا يُخزَّن أبداً. لا حاجة لمسح ذاكرة المتصفح بعد كل نشر.

**حد الطلبات:** 10 طلبات لكل عنوان IP في الدقيقة، قابل للتعديل عبر متغير البيئة
`RATE_LIMIT_ORDERS_PER_MIN`.

**النسخة السابقة:** محفوظة في `legacy/` — يمكن العودة إليها بنسخ ملفاتها إلى `src/public/`.
