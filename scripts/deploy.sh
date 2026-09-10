#!/bin/bash
#
# نشر بريماتكس على مضيف cPanel.
#
# تخطيط المضيف (تحقّقنا منه في cPanel، لا نفترضه):
#   نسخة git      /home4/brimatex/brimatex-git   ← تُحدَّث من GitHub
#   تطبيق Node    /home4/brimatex/app            ← ما يخدم brimatex.ly فعلاً
# مجلدان منفصلان، ولهذا لا يكفي السحب: النشر نسخٌ من الأول إلى الثاني ثم
# بناء وإعادة تشغيل هناك. المسار الهدف يُقرأ من DEPLOYPATH إن ضُبط، وإلّا
# فمن الافتراضي أدناه.
#
# التشغيل:
#   عبر cPanel ← Git™ Version Control ← Deploy HEAD Commit (يناديه ‎.cpanel.yml‎)
#   أو عبر SSH:  bash scripts/deploy.sh
#
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOYPATH="${DEPLOYPATH:-$HOME/app}"

say() { echo "▸ $*"; }

# التزام المصدر. يُطبع في سجلّ cPanel ويُكتب مع التطبيق، فيصير جواب
# ‎/api/health‎ قادراً على قول ما يخدم الموقع فعلاً — وهو ما لم نكن نعرفه:
# سحبٌ لم يتقدّم ونشرٌ ينسخ الشيفرة القديمة يبدوان ناجحين تماماً.
COMMIT="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)"

say "المصدر : $SRC"
say "الالتزام: $COMMIT"
say "الهدف  : $DEPLOYPATH"
[ -d "$DEPLOYPATH" ] || { echo "✗ مجلد التطبيق غير موجود: $DEPLOYPATH"; exit 1; }

# ── 1. node و npm ──
# تطبيقات Node على cPanel تعيش في بيئة معزولة، ومهامّ النشر تعمل بـPATH نظيف
# لا تظهر فيها. نفعّل البيئة إن لم يكن node حاضراً.
if ! command -v node >/dev/null 2>&1; then
  ACTIVATE="$(ls -1 "$HOME"/nodevenv/*/*/bin/activate 2>/dev/null | head -n 1 || true)"
  if [ -n "$ACTIVATE" ]; then
    say "تفعيل بيئة Node: $ACTIVATE"
    # ‎set -u‎ يُطفأ حول التفعيل وحده: سكربت CloudLinux يقرأ ‎CL_VIRTUAL_ENV‎
    # قبل تعريفه، فيسقط النشر كله بـ«unbound variable» عند السطر 78 — وهو
    # ما أوقف أول محاولة نشر فعلية. الملفّ ليس لنا فلا نملك إصلاحه، ونستعيد
    # الصرامة فور انتهائه.
    set +u
    # shellcheck disable=SC1090
    source "$ACTIVATE"
    set -u
  fi
fi
command -v node >/dev/null 2>&1 || { echo "✗ node غير متاح"; exit 1; }
say "node $(node --version)"

# ── 2. النسخ ──
# نسخٌ فوق الموجود بلا حذف: بيانات التشغيل في التطبيق (‎src/data/*.jsonl‎،
# ‎.env‎، ‎src/public/uploads/‎) ليست في المستودع، فلا تُمَسّ. و‎node_modules‎
# يُستثنى صراحةً كي لا نُبطئ النسخ بعشرات آلاف الملفات.
LOCK_BEFORE="$(md5sum "$DEPLOYPATH/package-lock.json" 2>/dev/null | cut -d' ' -f1 || echo none)"

say "نسخ الملفات"
# ‎./data‎ (المجلد القديم) و‎*.jsonl‎ مستثناة عمداً: المستودع يتتبّع نسخة
# قديمة من ‎data/users.jsonl‎ فيها حسابات حقيقية، ونسخُها فوق الخادم يطمس
# بيانات العملاء. النشر يحمل الشيفرة لا البيانات — أبداً.
tar -C "$SRC" \
    --exclude=.git \
    --exclude=node_modules \
    --exclude=web/node_modules \
    --exclude=./data \
    --exclude='*.jsonl' \
    --exclude='*.local.json' \
    --exclude=src/public/uploads \
    -cf - . | tar -C "$DEPLOYPATH" -xf -

LOCK_AFTER="$(md5sum "$DEPLOYPATH/package-lock.json" 2>/dev/null | cut -d' ' -f1 || echo none)"

cd "$DEPLOYPATH"

# ── 3. الاعتماديات ──
# ‎npm install‎ لا ‎npm ci‎: الثاني يمسح node_modules أولاً، وانقطاعه في المنتصف
# يترك الموقع بلا اعتماديات. ولا يُشغَّل إلا حين يتغيّر القفل فعلاً.
#
# ‎SKIP_BUILD=1‎ (نشر GitHub Actions): البناء تمّ على الرَنَر، فلا حاجة لاعتماديات
# ‎web/‎ على المضيف. ‎--ignore-scripts‎ يمنع ‎postinstall‎ من جرّ ‎npm --prefix web
# install‎ — وهي أثقل خطوة وأكثرها تعثّراً هنا. يبقى ‎pg‎ وحده اعتماديةَ الخادم.
if [ ! -d node_modules ] || [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  say "تثبيت الاعتماديات (تغيّر package-lock.json)"
  if [ "${SKIP_BUILD:-0}" = "1" ]; then
    npm install --no-audit --no-fund --ignore-scripts
  else
    npm install --no-audit --no-fund
  fi
else
  say "الاعتماديات كما هي — تخطّي التثبيت"
fi

# ── 4. البناء ──
# ‎src/public/‎ ناتج Vite، وصار متتبَّعاً في المستودع لأن المضيف لا يستطيع
# بناءه (Rollup 4 يتطلّب GLIBC 2.29 والمضيف أقدم) — فيصل محمولاً مع الشيفرة.
# والخادم يسقط بـENOENT إن غاب ‎src/public/index.html‎.
#
# إلّا حين يأتي النشر من GitHub Actions: هناك بُنِيَت الواجهة على الرَنَر ووصلت
# ضمن الحمولة، فإعادة بنائها على المضيف تكرارٌ بلا فائدة وعلى بيئة أهشّ.
# الفحص تحت هذه الكتلة يبقى كما هو — هو ما يحمي الموقع، لا خطوة البناء.
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  say "البناء جاهز من CI — تخطّي البناء على المضيف"
else
  say "بناء الواجهة"
  npm run build
fi

[ -f src/public/index.html ] || {
  echo "✗ البناء لم يُنتج src/public/index.html — نتوقّف قبل إعادة التشغيل كي يبقى الموقع على نسخته العاملة"
  exit 1
}

# الوجود وحده لا يعني الوصول. النسخ فوق الموجود بلا حذف، فملفٌّ قديم يبقى
# قديماً إن لم يُنسخ شيء — والحارس السابق كان يمرّ عليه ويطبع «نُشر» بينما
# الموقع على نسخته السابقة حرفياً. هذا ما حدث فعلاً: نشرٌ أخضر وموقع لم
# يتبدّل. فنقارن الهدف بالمصدر بايتاً ببايت.
[ -f "$SRC/src/public/index.html" ] || {
  echo "✗ المصدر نفسه بلا src/public/index.html — لا شيء لننشره"
  exit 1
}
SRC_SUM="$(md5sum "$SRC/src/public/index.html" | cut -d' ' -f1)"
DST_SUM="$(md5sum src/public/index.html | cut -d' ' -f1)"
if [ "$SRC_SUM" != "$DST_SUM" ]; then
  echo "✗ النسخ لم يصل: src/public/index.html في الهدف يخالف المصدر"
  echo "   المصدر $SRC_SUM ← الهدف $DST_SUM"
  echo "   الموقع باقٍ على نسخته العاملة. راجع استثناءات tar أعلاه."
  exit 1
fi
say "البناء سليم ومطابق للمصدر"

# ── 5. إعادة التشغيل ──
# Passenger يقرأ الشيفرة عند الإقلاع فقط؛ لمس هذا الملف يجعله يعيد الإقلاع عند
# أول طلب قادم، بلا انقطاع يراه الزائر.
# البصمة تُكتب بعد التحقّق لا قبله: بصمةٌ تسبق التأكّد تكذب كما كذب
# «نُشر» من قبل. وهي خارج المستودع فلا يمسّها النسخ.
printf '{"commit":"%s","at":"%s"}\n' "$COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > deployed.json

mkdir -p tmp
touch tmp/restart.txt
say "طُلبت إعادة التشغيل"

echo
echo "✅ نُشر الالتزام $COMMIT إلى $DEPLOYPATH"
echo "   تحقّق: curl -s https://brimatex.ly/api/health   ← يجب أن يقول version=$COMMIT"
