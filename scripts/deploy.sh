#!/bin/bash
#
# نشر بريماتكس على مضيف cPanel.
#
# يعمل من مكانه: لا مسارات مكتوبة داخله، فيصحّ أياً كان اسم المستخدم أو مجلد
# التطبيق على المضيف. شغّله عبر SSH:
#
#     bash scripts/deploy.sh
#
# أو دعه يعمل وحده من cPanel ← Git™ Version Control ← Deploy HEAD Commit،
# فيناديه ‎.cpanel.yml‎ بـ‎--no-pull‎ لأن cPanel يكون قد سحب قبله.
#
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

PULL=1
[ "${1:-}" = "--no-pull" ] && PULL=0

say() { echo "▸ $*"; }

# ── 1. node و npm ──
# تطبيقات Node على cPanel تعيش في بيئة معزولة، وسكربتات النشر تعمل بـPATH
# نظيف لا تظهر فيها. نفعّل البيئة إن لم يكن node حاضراً بالفعل.
if ! command -v node >/dev/null 2>&1; then
  ACTIVATE="$(ls -1 "$HOME"/nodevenv/*/*/bin/activate 2>/dev/null | head -n 1 || true)"
  if [ -n "$ACTIVATE" ]; then
    say "تفعيل بيئة Node: ${ACTIVATE}"
    # shellcheck disable=SC1090
    source "$ACTIVATE"
  fi
fi
command -v node >/dev/null 2>&1 || { echo "✗ node غير متاح — فعّل البيئة يدوياً ثم أعد التشغيل"; exit 1; }
say "node $(node --version)"

# ── 2. السحب ──
if [ "$PULL" -eq 1 ]; then
  LOCK_BEFORE="$(git rev-parse HEAD:package-lock.json 2>/dev/null || echo none)"
  say "سحب main"
  git pull --ff-only origin main
  LOCK_AFTER="$(git rev-parse HEAD:package-lock.json 2>/dev/null || echo none)"
else
  LOCK_BEFORE=skip
  LOCK_AFTER=skip
fi

# ── 3. الاعتماديات ──
# التثبيت الكامل بطيء وهشّ على هذه الاستضافة، فلا يُعاد إلا حين يتغيّر القفل
# فعلاً — أو حين لا يكون هناك node_modules أصلاً.
if [ ! -d node_modules ] || [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  say "تثبيت الاعتماديات (تغيّر package-lock.json)"
  npm ci --no-audit --no-fund
else
  say "الاعتماديات كما هي — تخطّي npm ci"
fi

# ── 4. البناء ──
# ‎src/public/‎ ناتج Vite ومستثنى من git، فبناؤه هنا ليس اختيارياً: الخادم
# يسقط بـENOENT إن غاب ‎src/public/index.html‎.
say "بناء الواجهة"
npm run build

if [ ! -f src/public/index.html ]; then
  echo "✗ البناء لم يُنتج src/public/index.html — أوقفنا قبل إعادة التشغيل كي لا يسقط الموقع"
  exit 1
fi
say "البناء سليم"

# ── 5. إعادة التشغيل ──
# Passenger يقرأ الشيفرة عند الإقلاع فقط؛ لمس هذا الملف يجعله يعيد الإقلاع
# عند أول طلب قادم، بلا انقطاع يراه الزائر.
mkdir -p tmp
touch tmp/restart.txt
say "طُلبت إعادة التشغيل (tmp/restart.txt)"

echo
echo "✅ نُشر $(git rev-parse --short HEAD) — $(git log -1 --format=%s)"
echo "   تحقّق: curl -s -o /dev/null -w '%{http_code}\\n' https://brimatex.ly/api/health"
