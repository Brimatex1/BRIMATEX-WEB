#!/bin/bash
#
# نشرٌ تلقائي على مضيف cPanel — تشغّله مهمّة cron كل خمس دقائق.
#
# لماذا cron على المضيف لا خطوةٌ في GitHub Actions: الدفعُ من GitHub إلى
# المضيف يحتاج سرّاً دائماً في المستودع (مفتاح SSH أو رمز API لـcPanel،
# والأخير صلاحيته على الحساب كله). اخترنا في deploy.yml «الضغطتين» على ذلك
# السرّ. هنا يسحب المضيفُ بنفسه من GitHub عبر https — المستودع عامّ، فلا
# سرّ في أي مكان — وينشر بـscripts/deploy.sh نفسه الذي يشغّله .cpanel.yml.
#
# في كل تشغيل:
#   1. git fetch. لا جديد والمنشور هو الرأس → خروجٌ صامت.
#   2. التزامٌ غيّر web/ ولم يُودَع ناتج بنائه بعد → ننتظر وركفلو البناء
#      (حتى BUILD_WAIT_MIN دقيقة، ثم ننشر على أي حال: تعديلٌ لا يغيّر الناتج
#      لا يُنتج التزام بناء أصلاً، ولا يجوز أن ننتظره إلى الأبد).
#   3. git merge --ff-only — لا reset ولا force: تغييرٌ محلي على المضيف
#      يوقف النشر ويُسجَّل بدل أن يُمسح.
#   4. scripts/deploy.sh — بحرّاسه: مقارنة md5 وبصمة deployed.json.
#   5. فشلٌ متكرّر للالتزام نفسه لا يُعاد كل خمس دقائق: ساعةٌ بين محاولتين.
#
# السجلّ: ~/logs/brimatex-auto-deploy.log (يُقصّ حين يكبر).
# الإيقاف المؤقّت: أنشئ الملف ~/.brimatex-auto-deploy-off
# الإزالة: bash scripts/install-auto-deploy.sh --remove
set -uo pipefail

# ── التشغيل من نسخة مؤقّتة ──
# git merge قد يعدّل هذا الملف نفسه أثناء تشغيله، وbash يقرأ السكربت سطراً
# سطراً من القرص — فيكمل من منتصف نسخةٍ أخرى. نعمل من نسخة لا يلمسها السحب.
TMP_DIR="${AUTO_DEPLOY_TMP:-$HOME/tmp}"
if [ -z "${AUTO_DEPLOY_RUNNER:-}" ]; then
  mkdir -p "$TMP_DIR"
  copy="$TMP_DIR/brimatex-auto-deploy.$$.sh"
  cp "$0" "$copy"
  AUTO_DEPLOY_RUNNER="$copy" AUTO_DEPLOY_ORIGIN="$(cd "$(dirname "$0")/.." && pwd)" exec /bin/bash "$copy" "$@"
fi
trap 'rm -f "$AUTO_DEPLOY_RUNNER"' EXIT

REPO_DIR="${REPO_DIR:-${AUTO_DEPLOY_ORIGIN:-$HOME/brimatex-git}}"
DEPLOYPATH="${DEPLOYPATH:-$HOME/app}"
BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
BUILD_WAIT_MIN="${BUILD_WAIT_MIN:-20}"
RETRY_AFTER_MIN="${RETRY_AFTER_MIN:-60}"
LOG="${AUTO_DEPLOY_LOG:-$HOME/logs/brimatex-auto-deploy.log}"
STATE="${AUTO_DEPLOY_STATE:-$TMP_DIR/brimatex-auto-deploy.state}"
LOCK="$TMP_DIR/brimatex-auto-deploy.lock"

mkdir -p "$(dirname "$LOG")" "$TMP_DIR"

# السجلّ يُقصّ إلى آخر 2000 سطر حين يتجاوز 1MB.
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ]; then
  tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG"; }

[ -e "$HOME/.brimatex-auto-deploy-off" ] && exit 0

# ── تشغيلٌ واحد في وقت واحد ──
# نشرٌ يأخذ أكثر من خمس دقائق (تثبيت اعتماديات مثلاً) لا يتداخل مع التالي.
if command -v flock >/dev/null 2>&1; then
  exec 9> "$LOCK"
  flock -n 9 || exit 0
else
  mkdir "$LOCK.d" 2>/dev/null || exit 0
  trap 'rm -f "$AUTO_DEPLOY_RUNNER"; rmdir "$LOCK.d" 2>/dev/null' EXIT
fi

# ── git ──
# مهامّ cron بمسار نظيف قد لا يكون git فيه — كمهامّ نشر cPanel تماماً.
GIT="$(command -v git || true)"
for g in /usr/local/cpanel/3rdparty/bin/git /usr/bin/git /usr/local/bin/git; do
  [ -n "$GIT" ] && break
  [ -x "$g" ] && GIT="$g"
done
[ -n "$GIT" ] || { log "✗ git غير متاح"; exit 1; }

cd "$REPO_DIR" || { log "✗ المستودع غير موجود: $REPO_DIR"; exit 1; }

# refspec صريح لا ‎fetch origin main‎: نسخة cPanel من المستودع بلا
# ‎remote.origin.fetch‎ (تُدير مراجعها بنفسها)، وبلا refspec مُهيَّأ لا يُحدّث
# git مرجعَ التتبّع ‎refs/remotes/origin/main‎ — فيبقى قديماً، ويرى السكربت
# «لا جديد» أبداً ويخرج صامتاً. حدث هذا فعلاً: المهمّة عملت كل خمس دقائق
# ولم تنشر التزاماً مدفوعاً، وسجلّها خالٍ.
if ! "$GIT" fetch --quiet "$REMOTE" "+refs/heads/$BRANCH:refs/remotes/$REMOTE/$BRANCH" 2>> "$LOG"; then
  log "✗ تعذّر السحب من $REMOTE — الشبكة أو GitHub"
  exit 1
fi

# حزامٌ ثانٍ: إن تعذّر قراءة مرجع التتبّع لأي سبب نعتمد FETCH_HEAD.
REMOTE_SHA="$("$GIT" rev-parse "$REMOTE/$BRANCH" 2>/dev/null || "$GIT" rev-parse FETCH_HEAD)"
if [ -z "$REMOTE_SHA" ]; then
  log "✗ تعذّر تحديد رأس $REMOTE/$BRANCH"
  exit 1
fi
LOCAL_SHA="$("$GIT" rev-parse HEAD)"
SHORT="$("$GIT" rev-parse --short "$REMOTE_SHA")"

# ما يخدم الموقع فعلاً — من البصمة التي يكتبها deploy.sh بعد التحقّق.
DEPLOYED="$(sed -n 's/.*"commit":"\([0-9a-f]*\)".*/\1/p' "$DEPLOYPATH/deployed.json" 2>/dev/null || true)"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ] && [ -n "$DEPLOYED" ] && [ "${REMOTE_SHA#"$DEPLOYED"}" != "$REMOTE_SHA" ]; then
  exit 0 # لا جديد، والمنشور هو الرأس
fi

# ── ناتج بناءٍ لم يُودَع بعد ──
WEB_C="$("$GIT" log -1 --format=%H "$REMOTE/$BRANCH" -- web/ 2>/dev/null || true)"
PUB_C="$("$GIT" log -1 --format=%H "$REMOTE/$BRANCH" -- src/public/ 2>/dev/null || true)"
if [ -n "$WEB_C" ] && { [ -z "$PUB_C" ] || ! "$GIT" merge-base --is-ancestor "$WEB_C" "$PUB_C"; }; then
  age_min=$(( ( $(date +%s) - $("$GIT" log -1 --format=%ct "$WEB_C") ) / 60 ))
  if [ "$age_min" -lt "$BUILD_WAIT_MIN" ]; then
    log "▸ $SHORT: الواجهة تغيّرت في $("$GIT" rev-parse --short "$WEB_C") ولم يُودَع ناتج بنائها — انتظار ($age_min/$BUILD_WAIT_MIN دقيقة)"
    exit 0
  fi
  log "▸ $SHORT: لا ناتج بناء بعد $age_min دقيقة — ننشر (تعديلٌ لم يغيّر الناتج على الأرجح)"
fi

# ── فشلٌ سابق للالتزام نفسه ──
if [ -f "$STATE" ]; then
  read -r failed_sha failed_at < "$STATE" || true
  if [ "${failed_sha:-}" = "$REMOTE_SHA" ] && [ $(( $(date +%s) - ${failed_at:-0} )) -lt $(( RETRY_AFTER_MIN * 60 )) ]; then
    exit 0
  fi
fi

# ── التقدّم ──
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  if ! "$GIT" diff --quiet || ! "$GIT" diff --cached --quiet; then
    log "✗ $SHORT: في المستودع على المضيف تغييرات محلية — لم يُسحب شيء. راجع $REPO_DIR"
    echo "$REMOTE_SHA $(date +%s)" > "$STATE"
    exit 1
  fi
  if ! "$GIT" merge --ff-only --quiet "$REMOTE/$BRANCH" 2>> "$LOG"; then
    log "✗ $SHORT: السحب ليس تقدّماً مباشراً (تاريخٌ أُعيدت كتابته؟) — لم يُلمس شيء"
    echo "$REMOTE_SHA $(date +%s)" > "$STATE"
    exit 1
  fi
fi

log "▸ نشر $SHORT (المنشور كان: ${DEPLOYED:-غير معروف})"
if DEPLOYPATH="$DEPLOYPATH" SKIP_BUILD=1 /bin/bash scripts/deploy.sh >> "$LOG" 2>&1; then
  rm -f "$STATE"
  log "✔ نُشر $SHORT"
else
  echo "$REMOTE_SHA $(date +%s)" > "$STATE"
  log "✗ فشل نشر $SHORT — المحاولة التالية بعد $RETRY_AFTER_MIN دقيقة (السجلّ أعلاه)"
  exit 1
fi
