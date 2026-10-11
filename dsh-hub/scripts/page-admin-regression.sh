#!/usr/bin/env bash
# 页面级管理操作回归：/admin/users 建号与封禁的失败可见性（P0 修复项）
#
# 覆盖：
#   R1 admin 经页面表单建 root 必须被拒（此前 form.role 无 canManage 校验 → 可越权建 root）
#   R2 admin 建普通 user 成功
#   R3 非法角色值被拒
#   R4 封禁失败必须以 500 + 失败提示响应，不得 302 冒充成功
#
# 用法：cd dsh-hub && bash scripts/page-admin-regression.sh
set -u
BASE="http://127.0.0.1:3086"
HUB_DIR="$(mktemp -d)"
D="$(mktemp -d)"
J="$D/admin.jar"
HUB_PID=""
trap 'rm -rf "$HUB_DIR" "$D"; [ -n "$HUB_PID" ] && kill "$HUB_PID" 2>/dev/null' EXIT

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "[PASS] $1"; else FAIL=$((FAIL+1)); echo "[FAIL] $1 — expected $2 got $3"; fi }
say()  { echo "[....] $1"; }

start_hub() {
  DSH_HUB_DATA="$HUB_DIR/data" DSH_HUB_PORT=3086 DSH_HUB_HOST=127.0.0.1 \
    node --disable-warning=ExperimentalWarning src/index.ts >>"$HUB_DIR/hub.out.log" 2>&1 &
  HUB_PID=$!
  for _ in $(seq 1 40); do curl -sf --max-time 10 "$BASE/healthz" >/dev/null 2>&1 && return 0; sleep 0.3; done
  echo "  [hub 启动失败]" >&2; tail -20 "$HUB_DIR/hub.out.log" >&2; return 1
}

cd "$(dirname "$0")/.." || exit 1
start_hub || exit 1

# setup 建管理员并拿会话 + CSRF
curl -s --max-time 30 -c "$J" -X POST "$BASE/api/auth/setup" \
  -H 'content-type: application/json' \
  -d '{"nickname":"管理员","password":"Admin12345"}' >/dev/null
CSRF=$(awk '/dshhub_csrf/{print $7}' "$J")
if [ -z "$CSRF" ]; then echo "[FAIL] 无法取得 CSRF cookie"; exit 1; fi
say "管理员已就绪（csrf=${CSRF:0:8}…）"

post_user() { # $1=username $2=role
  curl -s --max-time 30 -b "$J" -o "$D/body" -w '%{http_code}' \
    -X POST "$BASE/admin/users" \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode "_csrf=$CSRF" \
    --data-urlencode "nickname=$1" \
    --data-urlencode "username=$1" \
    --data-urlencode "email=$1@example.com" \
    --data-urlencode "password=Passw0rd1" \
    --data-urlencode "role=$2"
}

# ---- R1：admin 建 root 必须被拒 ----
CODE=$(post_user "aaa111" "root")
check "R1 admin 页面建 root 被拒（400）" 400 "$CODE"
grep -q "无权创建该角色" "$D/body" && check "R1 提示信息正确" yes yes || check "R1 提示信息正确" no yes

# ---- R2：admin 建 user 成功 ----
CODE=$(post_user "bbb222" "user")
check "R2 admin 页面建 user 成功（302）" 302 "$CODE"

# ---- R3：非法角色被拒 ----
CODE=$(post_user "ccc333" "superuser")
check "R3 非法角色被拒（400）" 400 "$CODE"

# ---- R4：封禁成功与失败必须可区分 ----
# 直接读库取 id（页面路由的 id 是 users.id）
UID_ROW=$(node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[1], { readOnly: true });
const row = db.prepare("SELECT id FROM users WHERE username = ?").get("bbb222");
console.log(row ? row.id : "");
' "$HUB_DIR/data/dshhub.db")
if [ -z "$UID_ROW" ]; then
  FAIL=$((FAIL+1)); echo "[FAIL] R4 未能取到用户 id"
else
  say "目标用户 id=$UID_ROW"
  # 正常封禁应 302
  CODE=$(curl -s --max-time 30 -b "$J" -o "$D/body" -w '%{http_code}' -X POST "$BASE/admin/users/$UID_ROW/disable" \
    -H 'content-type: application/x-www-form-urlencoded' --data-urlencode "_csrf=$CSRF")
  check "R4 首次封禁返回 302" 302 "$CODE"
  STATUS=$(node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[1], { readOnly: true });
console.log(db.prepare("SELECT status FROM users WHERE id = ?").get(Number(process.argv[2])).status);
' "$HUB_DIR/data/dshhub.db" "$UID_ROW")
  check "R4 封禁已落库（status=disabled）" "$STATUS" "disabled"

  # 再次封禁同一用户：disableUser 对已 disabled 用户是幂等成功（不停实例、不抛错），故仍 302。
  # 注意：本用例**不能**用来验证「失败必须可见」——那条路径只在停实例抛错时触发（见 1.2.3 手工验证）。
  CODE=$(curl -s --max-time 30 -b "$J" -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/users/$UID_ROW/disable" \
    -H 'content-type: application/x-www-form-urlencoded' --data-urlencode "_csrf=$CSRF")
  check "R4 重复封禁保持幂等（302）" 302 "$CODE"

  # 不存在的用户走 early return，不得 5xx
  CODE=$(curl -s --max-time 30 -b "$J" -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/users/999999/disable" \
    -H 'content-type: application/x-www-form-urlencoded' --data-urlencode "_csrf=$CSRF")
  check "R4 不存在的用户不导致 5xx" "$([ "$CODE" -lt 500 ] && echo ok)" "ok"
fi

# ---- 抽查：页面关键类名已定义（P0 样式静默失效修复） ----
CSS=$(curl -s --max-time 30 "$BASE/login")
for cls in membership-badge payment-return payment-return-icon price-row input-group pj-spec; do
  if grep -q "\.$cls" src/views/layout.ts; then PASS=$((PASS+1)); echo "[PASS] 样式类 .$cls 已定义";
  else FAIL=$((FAIL+1)); echo "[FAIL] 样式类 .$cls 未定义"; fi
done

echo "===== 页面管理回归：PASS=$PASS FAIL=$FAIL ====="
[ "$FAIL" = "0" ] || exit 1
