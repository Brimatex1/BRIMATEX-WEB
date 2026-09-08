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

say "المصدر : $SRC"
say "الهدف  : $DEPLOYPATH"
[ -d "$DEPLOYPATH" ] || { echo "✗ مجلد التطبيق غير موجود: $DEPLOYPATH"; exit 1; }

# ── 1. node و npm ──
# تطبيقات Node على cPanel تعيش في بيئة معزولة، ومهامّ النشر تعمل بـPATH نظيف
# لا تظهر فيها. نفعّل البيئة إن لم يكن node حاضراً.
if ! command -v node >/dev/null 2>&1; then
  ACTIVATE="$(ls -1 "$HOME"/nodevenv/*/*/bin/activate 2>/dev/null | head -n 1 || true)"
  if [ -n "$ACTIVATE" ]; then
    say "تفعيل بيئة Node: $ACTIVATE"
    # shellcheck disable=SC1090
    source "$ACTIVATE"
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
if [ ! -d node_modules ] || [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  say "تثبيت الاعتماديات (تغيّر package-lock.json)"
  npm install --no-audit --no-fund
else
  say "الاعتماديات كما هي — تخطّي التثبيت"
fi

# ── 4. البناء ──
# ‎src/public/‎ ناتج Vite ومستثنى من git، فبناؤه ليس اختيارياً: الخادم يسقط
# بـENOENT إن غاب ‎src/public/index.html‎.
say "بناء الواجهة"
npm run build

[ -f src/public/index.html ] || {
  echo "✗ البناء لم يُنتج src/public/index.html — نتوقّف قبل إعادة التشغيل كي يبقى الموقع على نسخته العاملة"
  exit 1
}
say "البناء سليم"

# ── 5. إعادة التشغيل ──
# Passenger يقرأ الشيفرة عند الإقلاع فقط؛ لمس هذا الملف يجعله يعيد الإقلاع عند
# أول طلب قادم، بلا انقطاع يراه الزائر.
mkdir -p tmp
touch tmp/restart.txt
say "طُلبت إعادة التشغيل"

echo
echo "✅ نُشر إلى $DEPLOYPATH"
echo "   تحقّق: curl -s -o /dev/null -w '%{http_code}\\n' https://brimatex.ly/api/health"
