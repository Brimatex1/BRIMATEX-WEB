#!/bin/bash
#
# غلافٌ لمهمّة cron حول scripts/sync-order-status.js.
#
# لماذا غلاف: مهامّ cron تعمل بمسار نظيف لا يظهر فيه node — نفس سبب تفعيل
# بيئة nodevenv في scripts/deploy.sh. ويعمل من مجلد التطبيق لا من مستودع
# git: هناك ‎.env‎ و‎node_modules‎.
#
# مهمّة cron المقترحة (كل عشر دقائق):
#   */10 * * * * /bin/bash $HOME/app/scripts/cron-order-sync.sh >> $HOME/logs/brimatex-order-sync.log 2>&1
#
# قراءةٌ فقط بلا إشعارات: DRY_RUN=1 bash scripts/cron-order-sync.sh
set -uo pipefail

APP_DIR="${APP_DIR:-$HOME/app}"
cd "$APP_DIR" || { echo "✗ مجلد التطبيق غير موجود: $APP_DIR"; exit 1; }

# ── مطابقة مخزن الخادم الحيّ ──
# التطبيق يعمل تحت Passenger ببيئته الخاصة: على هذا المضيف يُضبط
# DATABASE_URL فارغاً هناك ليبقى المخزن ملفّياً، بينما ‎.env‎ يحمل عنواناً
# حقيقياً — وcron يقرأ ‎.env‎. فلو تركناه لقرأت المزامنة قاعدة بيانات أخرى
# غير التي يكتب فيها الموقع: طلبات لا يراها العميل، وإشعارات لا تُرسل.
# نسأل الخادم نفسه أي مخزن يخدم (‎/api/health‎) ونطابقه.
HEALTH_URL="${HEALTH_URL:-https://brimatex.ly/api/health}"
if command -v curl >/dev/null 2>&1; then
  health="$(curl -fsS --max-time 20 "$HEALTH_URL" 2>/dev/null || true)"
  case "$health" in
    *'"store":"files"'*)
      export DATABASE_URL=""
      ;;
    *'"store":"postgres"'*)
      : # ‎.env‎ كما هو
      ;;
    *)
      echo "⚠ تعذّر معرفة مخزن الخادم من $HEALTH_URL — نكمل بإعداد .env"
      ;;
  esac
else
  echo "⚠ curl غير متاح — لا يمكن مطابقة مخزن الخادم؛ نكمل بإعداد .env"
fi

if ! command -v node >/dev/null 2>&1; then
  ACTIVATE="$(ls -1 "$HOME"/nodevenv/*/*/bin/activate 2>/dev/null | head -n 1 || true)"
  if [ -n "$ACTIVATE" ]; then
    # ‎set -u‎ مُطفأ حول التفعيل وحده: سكربت CloudLinux يقرأ CL_VIRTUAL_ENV
    # قبل تعريفه — نفس ما كان يُسقط النشر (انظر scripts/deploy.sh).
    set +u
    # shellcheck disable=SC1090
    source "$ACTIVATE"
    set -u
  fi
fi
command -v node >/dev/null 2>&1 || { echo "✗ node غير متاح"; exit 1; }

exec node scripts/sync-order-status.js
