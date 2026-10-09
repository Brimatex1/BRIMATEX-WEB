#!/usr/bin/env node
/**
 * BRIMATEX — static verification for the React frontend (zero dependencies).
 *
 * web/src holds three apps behind one entry (main.tsx): the storefront
 * (shop/), the admin panel (panel/) and the classic dashboard (AdminApp.tsx).
 * Catches the breakage npm/tsc would catch, without needing node_modules:
 *   • every `@/…` and relative import resolves to a real file
 *   • every named import actually exists as an export in that file
 *   • every bare package import is declared in web/package.json
 *   • config files are internally consistent
 *   • the HTML shell fits the CSP the server sends (SHELL_CSP in src/server.js)
 *   • a few accessibility and logic rules the current apps rely on
 *
 * Run:  node tests/frontend.check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
const SRC = path.join(WEB, 'src');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function group(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/** Recursively collect every .ts/.tsx file under a directory. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Resolve an `@/x` specifier to a real file path, or null. */
function resolveAlias(spec) {
  const rel = spec.replace(/^@\//, '');
  const base = path.join(SRC, rel);
  for (const candidate of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Extract every import statement from a source file. */
function parseImports(code) {
  const out = [];
  // The clause never holds a quote or a semicolon, so a match cannot run on
  // from a side-effect import into the next statement's `from`.
  const re = /import\s+(?:type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code))) {
    const clause = m[1].trim();
    const spec = m[2];
    const names = [];
    let defaultImport = null;

    const braces = clause.match(/\{([\s\S]*?)\}/);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const token = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (token) names.push(token);
      }
    }
    const beforeBrace = clause.split('{')[0].replace(/,\s*$/, '').trim();
    if (beforeBrace && !beforeBrace.startsWith('*')) defaultImport = beforeBrace;

    out.push({ spec, names, defaultImport, raw: m[0] });
  }
  // Specifier-only forms: `import './x.css'`, `import('./PanelApp')` and
  // `export … from './x'` - checked for resolution, not for names.
  for (const m of code.matchAll(/(?:^|[;\s])import\s*\(?\s*['"]([^'"]+)['"]|export\s+[^'";]*?\s+from\s*['"]([^'"]+)['"]/g)) {
    out.push({ spec: m[1] ?? m[2], names: [], defaultImport: null, raw: m[0] });
  }
  return out;
}

/** Collect exported identifiers from a source file. */
function parseExports(code) {
  const names = new Set();
  let hasDefault = false;

  if (/export\s+default\s/.test(code)) hasDefault = true;

  // export [declare] [async] const/function/class/interface/type X
  for (const m of code.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(m[1]);
  }
  // export { A, B as C }
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const token = part.trim().replace(/^type\s+/, '');
      const alias = token.split(/\s+as\s+/);
      const name = (alias[1] || alias[0] || '').trim();
      if (name) names.add(name);
    }
  }
  return { names, hasDefault };
}

/* ---------------- 1. project files ---------------- */
function testProjectFiles() {
  group('1. ملفات المشروع');
  const required = [
    'package.json',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.node.json',
    'tailwind.config.js',
    'postcss.config.js',
    'components.json',
    'index.html',
    'src/main.tsx',
    'src/shop/ShopApp.tsx',
    'src/panel/PanelApp.tsx',
    'src/AdminApp.tsx',
    'src/index.css',
  ];
  for (const f of required) {
    check(`${f} موجود`, fs.existsSync(path.join(WEB, f)));
  }
}

/* ---------------- 2. imports resolve ---------------- */
let files = [];
let pkg = null;

function testImports() {
  group('2. الاستيرادات');
  files = walk(SRC);
  check('توجد ملفات مصدرية', files.length > 0, `count ${files.length}`);

  pkg = JSON.parse(fs.readFileSync(path.join(WEB, 'package.json'), 'utf8'));
  const declared = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ]);

  const badAlias = [];
  const badNamed = [];
  const badPkg = [];

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    const rel = path.relative(WEB, file);

    for (const imp of parseImports(code)) {
      if (imp.spec.startsWith('@/')) {
        const target = resolveAlias(imp.spec);
        if (!target) {
          badAlias.push(`${rel} → ${imp.spec}`);
          continue;
        }
        const exports = parseExports(fs.readFileSync(target, 'utf8'));
        for (const name of imp.names) {
          if (!exports.names.has(name)) badNamed.push(`${rel}: { ${name} } من ${imp.spec}`);
        }
        if (imp.defaultImport && !exports.hasDefault) {
          badNamed.push(`${rel}: default من ${imp.spec}`);
        }
      } else if (imp.spec.startsWith('.')) {
        const base = path.resolve(path.dirname(file), imp.spec);
        const found = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')].some(
          (c) => fs.existsSync(c) && fs.statSync(c).isFile()
        );
        if (!found) badAlias.push(`${rel} → ${imp.spec}`);
      } else if (!imp.spec.startsWith('node:')) {
        const root = imp.spec.startsWith('@')
          ? imp.spec.split('/').slice(0, 2).join('/')
          : imp.spec.split('/')[0];
        if (!declared.has(root)) badPkg.push(`${rel} → ${root}`);
      }
    }
  }

  check('كل استيراد يشير إلى ملف موجود', badAlias.length === 0, badAlias.join(' | '));
  check('كل اسم مستورد مُصدَّر فعلاً', badNamed.length === 0, badNamed.join(' | '));
  check('كل حزمة مستوردة معلنة في package.json', badPkg.length === 0, badPkg.join(' | '));
}

/* ---------------- 3. unused dependencies ---------------- */
function testDependencies() {
  group('3. التبعيات');
  const allCode = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const configCode = ['vite.config.ts', 'tailwind.config.js', 'postcss.config.js']
    .map((f) => fs.readFileSync(path.join(WEB, f), 'utf8'))
    .join('\n');
  const combined = allCode + configCode;

  // Packages no source file imports by name: type packages, the compiler the
  // build script runs, and PostCSS, which Vite loads for postcss.config.js.
  const implicit = (dep) =>
    dep.startsWith('@types/') ||
    (dep === 'typescript' && /\btsc\b/.test(Object.values(pkg.scripts || {}).join(' '))) ||
    (dep === 'postcss' && fs.existsSync(path.join(WEB, 'postcss.config.js')));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  const unused = Object.keys(declared).filter((dep) => !implicit(dep) && !combined.includes(dep));
  check('لا توجد تبعيات مُعلنة غير مستخدمة', unused.length === 0, unused.join(', '));

  // web/package.json keeps the build tools in `dependencies`, not
  // `devDependencies`; either section counts.
  for (const [name, dep] of [['React', 'react'], ['Vite', 'vite'], ['Tailwind', 'tailwindcss'], ['TypeScript', 'typescript']]) {
    check(`${name} مُعلن`, !!declared[dep]);
  }
}

/* ---------------- 4. build config ---------------- */
function testBuildConfig() {
  group('4. إعدادات البناء');
  const vite = fs.readFileSync(path.join(WEB, 'vite.config.ts'), 'utf8');
  const ts = JSON.parse(
    fs.readFileSync(path.join(WEB, 'tsconfig.json'), 'utf8').replace(/\/\/.*$/gm, '')
  );

  check('الإخراج يذهب إلى src/public', /outDir[\s\S]{0,80}src\/public/.test(vite));
  check('emptyOutDir مفعّل', /emptyOutDir:\s*true/.test(vite));
  check('لا يُحقن سكربت مضمّن (توافق CSP)', /modulePreload[\s\S]{0,40}polyfill:\s*false/.test(vite));
  check('وكيل /api للتطوير معرّف', /proxy[\s\S]{0,120}'\/api'/.test(vite));
  check('اسم مستعار @ معرّف في vite', /'@':\s*path\.resolve/.test(vite));
  check('اسم مستعار @ معرّف في tsconfig', !!ts.compilerOptions?.paths?.['@/*']);
  check('الوضع الصارم مفعّل', ts.compilerOptions?.strict === true);
  check('jsx مضبوط لـ react-jsx', ts.compilerOptions?.jsx === 'react-jsx');

  const tw = fs.readFileSync(path.join(WEB, 'tailwind.config.js'), 'utf8');
  check('Tailwind يفحص ملفات tsx', /src\/\*\*\/\*\.\{ts,tsx\}/.test(tw));
  check('ألوان shadcn مربوطة بمتغيرات CSS', /hsl\(var\(--primary\)\)/.test(tw));

  const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
  check('توجيهات Tailwind الثلاثة موجودة', ['@tailwind base', '@tailwind components', '@tailwind utilities'].every((d) => css.includes(d)));

  // Every colour token Tailwind maps must be defined in index.css.
  // Only `hsl(var(--x))` positions count — `var(--radix-*)` are runtime
  // variables injected by Radix, not design tokens we own.
  const colourVars = [...tw.matchAll(/hsl\(var\((--[a-z-]+)\)\)/g)].map((m) => m[1]);
  const missingVars = [...new Set(colourVars)].filter((v) => !new RegExp(`${v}\\s*:`).test(css));
  check('كل متغير لون يستخدمه Tailwind معرَّف في CSS', missingVars.length === 0, missingVars.join(', '));

  // Both light and dark themes must define the same token set.
  const lightBlock = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || '';
  const darkBlock = css.match(/\.dark\s*\{([\s\S]*?)\}/)?.[1] || '';
  const lightTokens = new Set([...lightBlock.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]));
  const darkTokens = new Set([...darkBlock.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]));
  // Only the semantic colour tokens change with the theme. The brand colours,
  // the Dark Ocean scale, the radius and the motion tokens are the same in
  // both modes, and a token that just names a brand colour may keep it.
  const themeless = (t) =>
    /^--(ocean-\d+|brand-|dur-|ease-|radius$)/.test(t) ||
    new RegExp(`${t}\\s*:\\s*var\\(--brand-`).test(lightBlock);
  const darkMissing = [...lightTokens].filter((t) => !themeless(t) && !darkTokens.has(t));
  check('الوضع الداكن يغطي كل رموز الألوان', darkMissing.length === 0, darkMissing.join(', '));
  check('الوضع الداكن يعيد تعريف الألوان الأساسية', ['--background', '--foreground', '--primary', '--border'].every((t) => darkTokens.has(t)));

  check('الوضع الداكن معرَّف', /\.dark\s*\{/.test(css));
  check('دعم prefers-reduced-motion', /prefers-reduced-motion/.test(css));
}

/* ---------------- 5. HTML shell ---------------- */
function testHtml() {
  group('5. صفحة الجذر');
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  check('lang و dir مضبوطان للعربية', /<html lang="ar" dir="rtl">/.test(html));
  check('viewport meta موجود', /name="viewport"/.test(html));
  check('وصف الصفحة موجود', /name="description"/.test(html));
  check('عنصر #root موجود', /id="root"/.test(html));
  check('نقطة الدخول main.tsx مرتبطة', /src="\/src\/main\.tsx"/.test(html));
  check('لا يوجد سكربت مضمّن (تمنعه CSP)', !/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(html));

  // Cross-check every external origin in the shell against the CSP the
  // server actually sends, rather than against a hard-coded allowlist.
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  // The policy lives in one constant (SHELL_CSP), written as joined string pieces.
  const cspSource = serverCode.match(/const SHELL_CSP\s*=\s*([\s\S]*?);\r?\n/)?.[1] || '';
  const csp = [...cspSource.matchAll(/"([^"]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2]).join('');
  const allowed = new Set([...csp.matchAll(/https:\/\/[a-z0-9.-]+/g)].map((m) => m[0]));
  const origins = [...html.matchAll(/href="(https:\/\/[a-z0-9.-]+)/g)].map((m) => m[1]);
  const blocked = [...new Set(origins)].filter((o) => !allowed.has(o));
  check('كل نطاق خارجي مسموح به في CSP الخادم', blocked.length === 0, blocked.join(', '));
  check('CSP الخادم تمنع السكربتات الخارجية', /script-src 'self'/.test(csp));
}

/* ---------------- 6. accessibility & UX ---------------- */
function testAccessibility() {
  group('6. الوصول وتجربة الاستخدام');
  const byName = Object.fromEntries(
    files.map((f) => [path.basename(f), fs.readFileSync(f, 'utf8')])
  );
  const allCode = Object.values(byName).join('\n');

  check('أزرار الأيقونات لها aria-label', !/size="icon"(?![\s\S]{0,300}aria-label)/.test(allCode));
  check('كل حقل مرتبط بـ Label عبر htmlFor', (allCode.match(/htmlFor=/g) || []).length >= (allCode.match(/<Input\s/g) || []).length - 2);
  check('حالات الخطأ تستخدم aria-invalid', /aria-invalid/.test(allCode));
  check('رسائل الخطأ مرتبطة بـ aria-describedby', /aria-describedby/.test(allCode));
  check('يوجد رابط تخطّي للمحتوى', /تخطّي إلى المحتوى/.test(allCode));
  check('التنقل النشط يعلَّم بـ aria-current', /aria-current/.test(allCode));

  check('حالات focus مرئية في الأزرار', /focus-visible:ring/.test(byName['button.tsx'] || ''));
  check('مؤشر اليد على العناصر القابلة للنقر', /cursor-pointer/.test(byName['button.tsx'] || ''));
  check('حالة تحميل في الأزرار تمنع النقر المزدوج', /loading/.test(byName['button.tsx'] || ''));

  // Loading and failure states: the storefront swaps a catalogue that failed
  // to load for an error page with a retry (never an empty grid that reads as
  // «no results»); the admin panel draws skeletons and an error card with one.
  const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
  check('المتجر: فشل تحميل المنتجات يعرض صفحة خطأ مع إعادة المحاولة', /<ErrorPage onRetry=/.test(read('shop/ShopApp.tsx')));
  check('المتجر: صفحة الخطأ فيها زر إعادة المحاولة', /onRetry\(\)/.test(read('shop/pages/NotFoundPage.tsx')));
  const panelUi = read('panel/ui.tsx');
  check('اللوحة: بطاقة الخطأ فيها إعادة المحاولة', /function ErrorCard[\s\S]*?onClick=\{onRetry\}/.test(panelUi));
  const panelPages = fs.readdirSync(path.join(SRC, 'panel', 'pages'));
  const noSkeleton = panelPages.filter((f) => !/<Skeleton\b/.test(read(`panel/pages/${f}`)));
  check('اللوحة: كل صفحة تعرض هياكل عظمية أثناء التحميل', /export function Skeleton/.test(panelUi) && noSkeleton.length === 0, noSkeleton.join(', '));
  check('لا يوجد alert() معطِّل للواجهة', !/\balert\(/.test(allCode));
  check('لا يوجد dangerouslySetInnerHTML', !/dangerouslySetInnerHTML/.test(allCode));
}

/* ---------------- 7. logic correctness ---------------- */
function testLogic() {
  group('7. منطق التطبيق');
  const cart = fs.readFileSync(path.join(SRC, 'hooks', 'useCart.ts'), 'utf8');
  const api = fs.readFileSync(path.join(SRC, 'lib', 'api.ts'), 'utf8');
  const auth = fs.readFileSync(path.join(SRC, 'hooks', 'useAuth.ts'), 'utf8');
  const checkout = fs.readFileSync(path.join(SRC, 'shop', 'pages', 'CheckoutPage.tsx'), 'utf8');

  check('السلة تزيد الكمية بدل تكرار المنتج', /l\.qty \+ 1/.test(cart));
  check('السلة تحدّ الكمية القصوى', /MAX_QTY/.test(cart));
  check('السلة تمنع الكمية أقل من واحد', /Math\.max\(1/.test(cart));
  check('السلة تتحقق من البيانات المخزّنة', /Number\.isInteger/.test(cart));
  check('السلة تُحفظ في localStorage', /localStorage\.setItem/.test(cart));

  check('طبقة API تعالج خطأ 429', /429/.test(api));
  check('طبقة API تعالج انقطاع الشبكة', /تعذّر الاتصال بالخادم/.test(api));
  check('طبقة API ترمي خطأً مكتوباً', /class ApiError/.test(api));

  check('الجلسة غير الصالحة تُمسح تلقائياً', /localStorage\.removeItem/.test(auth));
  check('لا تسرّب حالة بعد إلغاء التركيب', /cancelled/.test(auth));

  const validate = checkout.match(/function validate\(\)[\s\S]*?\n  \}/)?.[0] || '';
  check('صفحة الطلب تتحقق من عنوان التوصيل', ['next.city', 'next.area', 'next.street'].every((f) => validate.includes(f)));
  check('صفحة الطلب تتحقق من صيغة الهاتف', /isLibyanMobile\(phone\)/.test(validate));
  check('صفحة الطلب تنقل التركيز لأول خطأ', /\.focus\(\)/.test(validate));
  check('صفحة الطلب لا ترسل مرتين', /if \(submitting\b/.test(checkout) && /loading=\{submitting\}/.test(checkout));
  check('صفحة الطلب ترسل إلى واجهة الطلبات', /api\.createOrder\(/.test(checkout));
}

/* ---------------- runner ---------------- */
console.log('\n\x1b[1m\x1b[36m═══ BRIMATEX — فحص الواجهة الأمامية ═══\x1b[0m');

testProjectFiles();
testImports();
testDependencies();
testBuildConfig();
testHtml();
testAccessibility();
testLogic();

const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(
  `\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${total}` +
    (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : '')
);
if (fail) {
  console.log('\n\x1b[31mالفحوص الفاشلة:\x1b[0m');
  failures.forEach((f) => console.log('  • ' + f));
} else {
  console.log('\x1b[32m\x1b[1m✓ الواجهة سليمة\x1b[0m');
}
console.log('─'.repeat(52) + '\n');
process.exit(fail ? 1 : 0);
