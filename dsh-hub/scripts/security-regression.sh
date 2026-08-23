#!/usr/bin/env bash
# M2.1 安全回归：攻击剧本全量验证（配套审查报告的高危/中危修复项）。
# 覆盖：A1 封禁生效(会话/token/实例) · A2 版本注入拒绝+default/白名单 ·
#       A3 admin 不可建 admin · A6 并发 setup 单管理员 · C2 并发建实例不超配额 ·
#       B1/B6 spawn 失败 hub 存活 · B2 运行中崩溃状态同步 · B4 并发操作无 500 ·
#       E1 畸形编码 400 · E3 空昵称 400
# 依赖：真实 dsh（同 m2-smoke）；B1 用例需要 npm registry 可达（S4 已确认）。
# 用法：cd dsh-hub && bash scripts/security-regression.sh
set -u
BASE="http://127.0.0.1:3084"
HUB_DIR="$(mktemp -d)"
D="$(mktemp -d)"
J="$D/admin.jar"; C="$D/user.jar"
HUB_PID=""
trap 'rm -rf "$HUB_DIR" "$D"; [ -n "$HUB_PID" ] && kill "$HUB_PID" 2>/dev/null' EXIT

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "[PASS] $1"; else FAIL=$((FAIL+1)); echo "[FAIL] $1 — expected $2 got $3"; fi }
say()  { echo "[....] $1"; }
code() { curl -s --max-time 60 -o "$D/body" -w '%{http_code}' "$@"; }

start_hub() {
  DSH_HUB_DATA="$HUB_DIR/data" DSH_HUB_PORT=3084 DSH_HUB_HOST=127.0.0.1 \
    node --disable-warning=ExperimentalWarning src/index.ts >>"$HUB_DIR/hub.out.log" 2>&1 &
  HUB_PID=$!
  for _ in $(seq 1 30); do curl -sf --max-time 10 "$BASE/healthz" >/dev/null 2>&1 && return 0; sleep 0.3; done
  echo "  [hub 启动失败]" >&2; tail -20 "$HUB_DIR/hub.out.log" >&2; return 1
}

cd "$(dirname "$0")/.." || exit 1
start_hub || exit 1

# ---- E3：空昵称（净化后为空）拒绝（此时无用户，setup 可达） ----
CODE=$(code -X POST "$BASE/api/auth/setup" -H 'content-type: application/json' -d '{"nickname":"///","password":"Passw0rd!"}')
check "E3 空昵称 setup 拒绝" 400 "$CODE"

# ---- A6：并发 setup 只出一个管理员 ----
# 注意：wait 必须只等 curl 子壳（无参数 wait 会连 hub 后台作业一起等 → 永久挂起）
OK=0
CPIDS=()
for i in 1 2 3 4 5; do
  ( curl -s --max-time 60 -o "$D/s$i" -w '%{http_code}' -X POST "$BASE/api/auth/setup" \
      -H 'content-type: application/json' -d "{\"nickname\":\"admin$i\",\"password\":\"Passw0rd!\"}" > "$D/c$i" ) &
  CPIDS+=($!)
done
wait "${CPIDS[@]}"
for i in 1 2 3 4 5; do [ "$(cat "$D/c$i")" = "200" ] && OK=$((OK+1)); done
check "A6 并发 5×setup 恰 1 个成功" 1 "$OK"

# 管理员 A 登录
CSRF_A=$(awk '/dshhub_csrf/{print $7}' "$D/c1" 2>/dev/null || true)
# 找到成功的 jar（哪个 setup 成功未知：并发下用任一 200 的响应建会话不可行，直接登录）
curl -s --max-time 60 -c "$J" -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -d '{"nickname":"管理员","password":"Admin12345"}' >/dev/null 2>&1 || true
# 上面密码是 m1 习惯用法，这里 setup 的密码是 Passw0rd!，逐个尝试
for n in admin1 admin2 admin3 admin4 admin5; do
  curl -s --max-time 60 -c "$J" -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -d "{\"nickname\":\"$n\",\"password\":\"Passw0rd!\"}" >/dev/null 2>&1
  grep -q dshhub_sid "$J" && break
done
if ! grep -q dshhub_sid "$J"; then echo "[FAIL] 无法登录任意并发 setup 管理员"; exit 1; fi
CSRF_A=$(awk '/dshhub_csrf/{print $7}' "$J")
ME=$(curl -s --max-time 60 -b "$J" "$BASE/api/me")
ROLE_A=$(echo "$ME" | grep -o '"role":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "  [管理员 A role=$ROLE_A]"

# ---- A3：admin 不可建 admin（仅能建 user） ----
CODE=$(code -b "$J" -X POST "$BASE/admin/api/users" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_A" -d '{"nickname":"boss","password":"Passw0rd!","role":"admin"}')
check "A3 admin 建 admin 拒绝" 403 "$CODE"
CODE=$(code -b "$J" -X POST "$BASE/admin/api/users" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_A" -d '{"nickname":"userC","password":"Passw0rd!","role":"user"}')
check "A3 admin 建 user 允许" 200 "$CODE"
CID=$(grep -o '"id":[0-9]*' "$D/body" | head -1 | cut -d: -f2)

# ---- A2：harness_version 注入拒绝 + 合法 semver 通过 ----
for bad in "file:/etc" "github:user/repo" "latest" "*" "^0.1.0" "git+https://x/y.git" "0.1.1-rc.2 --help"; do
  CODE=$(code -b "$J" -X POST "$BASE/api/instances" -H 'content-type: application/json' \
    -H "x-csrf-token: $CSRF_A" -d "{\"name\":\"x\",\"harness_version\":\"$bad\"}")
  [ "$CODE" = "400" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] A2 注入版本应 400：$bad 实得 $CODE"; }
done
say "A2 七种注入 spec 全部 400"

# ---- A2：default_harness_version 生效 ----
CODE=$(code -b "$J" -X PUT "$BASE/admin/api/settings" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_A" -d '{"default_harness_version":"0.1.1-rc.2"}')
check "A2 设置 default 版本" 200 "$CODE"
CODE=$(code -b "$J" -X POST "$BASE/api/instances" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_A" -d '{"name":"vdef"}')
grep -q '"harness_version":"0.1.1-rc.2"' "$D/body" && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 未指定版本应取 default"; }
check "A2 未指定版本创建允许" 200 "$CODE"

# ---- A2：allowed_harness_versions 白名单 ----
CODE=$(code -b "$J" -X PUT "$BASE/admin/api/settings" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_A" -d '{"allowed_harness_versions":"9.9.9","default_harness_version":""}')
check "A2 设置精确白名单" 200 "$CODE"
CODE=$(code -b "$J" -X POST "$BASE/api/instances" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_A" -d '{"name":"vok","harness_version":"0.1.1-rc.2"}')
check "A2 白名单外版本拒绝" 403 "$CODE"
CODE=$(code -b "$J" -X POST "$BASE/api/instances" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_A" -d '{"name":"vok2","harness_version":"9.9.9"}')
check "A2 白名单内版本允许" 200 "$CODE"
CODE=$(code -b "$J" -X PUT "$BASE/admin/api/settings" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_A" -d '{"allowed_harness_versions":""}')
check "A2 清空白名单" 200 "$CODE"

# ---- A1：封禁 = 会话/token 吊销 + 实例停止 ----
# C 登录、签发 token、建实例并启动
curl -s --max-time 60 -c "$C" -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -d '{"nickname":"userC","password":"Passw0rd!"}' >/dev/null
CSRF_C=$(awk '/dshhub_csrf/{print $7}' "$C")
TOKEN=$(code -b "$C" -X POST "$BASE/api/me/tokens" -H 'content-type: application/json' -H "x-csrf-token: $CSRF_C" -d '{"name":"ci"}' >/dev/null; grep -o '"token":"[^"]*"' "$D/body" | cut -d'"' -f4)
RESP=$(curl -s --max-time 60 -b "$C" -X POST "$BASE/api/instances" -H 'content-type: application/json' -H "x-csrf-token: $CSRF_C" -d '{"name":"C的实例"}')
IID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
PORT=$(echo "$RESP" | grep -o '"port":[0-9]*' | cut -d: -f2)
CODE=$(code -b "$C" -X POST "$BASE/api/instances/$IID/start" -H "x-csrf-token: $CSRF_C")
check "A1 启动 C 的实例（准备封禁场景）" 200 "$CODE"
READY=0
for _ in $(seq 1 120); do curl -sf --max-time 10 "http://127.0.0.1:$PORT/" -o /dev/null 2>/dev/null && { READY=1; break; }; sleep 0.5; done
check "A1 实例就绪" 1 "$READY"

CODE=$(code -b "$J" -X PATCH "$BASE/admin/api/users/$CID" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_A" -d '{"status":"disabled"}')
check "A1 管理员封禁 C" 200 "$CODE"
CODE=$(code -b "$C" "$BASE/api/me")
check "A1 封禁后 C 会话失效（401）" 401 "$CODE"
CODE=$(code -H "Authorization: Bearer $TOKEN" "$BASE/api/me")
check "A1 封禁后 C 的 Bearer 失效（401）" 401 "$CODE"
ST=$(curl -s --max-time 60 -b "$J" "$BASE/api/instances/$IID" | grep -o '"status":"[^"]*"' | head -1)
echo "$ST" | grep -q stopped && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 封禁应停止其实例，实得 $ST"; }
CODE=$(code -b "$C" -X PATCH "$BASE/admin/api/users/$CID" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_C" -d '{"status":"active"}')
check "A1 被禁者不可自解封（401）" 401 "$CODE"

# ---- C2：并发建实例不超配额 ----
CODE=$(code -b "$J" -X PATCH "$BASE/admin/api/users/$CID" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_A" -d '{"status":"active","max_instances":2}')
check "C2 恢复 C 并设 max_instances=2（已有 1 实例）" 200 "$CODE"
curl -s --max-time 60 -c "$C" -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -d '{"nickname":"userC","password":"Passw0rd!"}' >/dev/null
CSRF_C=$(awk '/dshhub_csrf/{print $7}' "$C")
N_OK=0
CPIDS=()
for i in 1 2 3; do
  ( curl -s --max-time 60 -o "$D/cc$i" -w '%{http_code}' -b "$C" -X POST "$BASE/api/instances" \
      -H 'content-type: application/json' -H "x-csrf-token: $CSRF_C" -d "{\"name\":\"并发$i\"}" > "$D/cr$i" ) &
  CPIDS+=($!)
done
wait "${CPIDS[@]}"
for i in 1 2 3; do [ "$(cat "$D/cr$i")" = "200" ] && N_OK=$((N_OK+1)); done
check "C2 并发 3×建实例恰 1 成功（已用 1/上限 2）" 1 "$N_OK"

# ---- B1/B6：spawn 前防御（supervisor 二次校验非法版本）hub 不崩溃、实例标 failed ----
# 确定性本地用例（不依赖网络）：绕过 API 直改 DB 注入非法版本 → start 应立即 failed
CODE=$(code -b "$J" -X POST "$BASE/api/instances" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF_A" -d '{"name":"badver","harness_version":"0.1.1-rc.2"}')
check "B1 建实例（准备防御层用例）" 200 "$CODE"
BID=$(grep -o '"id":"[^"]*"' "$D/body" | cut -d'"' -f4)
node --disable-warning=ExperimentalWarning -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('$HUB_DIR/data/dshhub.db');
db.prepare(\"UPDATE instances SET harness_version = 'file:/etc' WHERE id = ?\").run('$BID');
console.log('DB 直改非法版本完成');
"
CODE=$(code -b "$J" -X POST "$BASE/api/instances/$BID/start" -H "x-csrf-token: $CSRF_A")
check "B1 supervisor 二次校验拒绝（502 start_failed）" 502 "$CODE"
CODE=$(code "$BASE/healthz")
check "B1 失败后 hub 存活" 200 "$CODE"
ST=$(curl -s --max-time 10 -b "$J" "$BASE/api/instances/$BID" | grep -o '"status":"[^"]*"' | head -1)
echo "$ST" | grep -q failed && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 非法版本实例应 failed，实得 $ST"; }

# ---- B2：运行中实例崩溃 → 状态自动校正为 failed ----
CODE=$(code -b "$C" -X POST "$BASE/api/instances/$IID/start" -H "x-csrf-token: $CSRF_C")
check "B2 重新启动 C 的实例" 200 "$CODE"
READY=0
for _ in $(seq 1 120); do curl -sf --max-time 10 "http://127.0.0.1:$PORT/" -o /dev/null 2>/dev/null && { READY=1; break; }; sleep 0.5; done
check "B2 实例再次就绪" 1 "$READY"
VPID=$(curl -s --max-time 60 -b "$J" "$BASE/api/instances/$IID" | grep -o '"pid":[0-9]*' | cut -d: -f2)
kill -9 "$VPID" 2>/dev/null
sleep 2
ST=$(curl -s --max-time 60 -b "$J" "$BASE/api/instances/$IID" | grep -o '"status":"[^"]*"' | head -1)
echo "$ST" | grep -q failed && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 崩溃后状态应 failed，实得 $ST"; }
CODE=$(code -b "$C" -X POST "$BASE/api/instances/$IID/start" -H "x-csrf-token: $CSRF_C")
check "B2 崩溃后仍可重新启动" 200 "$CODE"

# ---- B4：并发 start/stop 不产生 500 ----
CODE=$(code -b "$C" -X POST "$BASE/api/instances/$IID/stop" -H "x-csrf-token: $CSRF_C")
check "B4 先停实例（并发准备）" 200 "$CODE"
curl -s --max-time 60 -o "$D/r1" -w '%{http_code}' -b "$C" -X POST "$BASE/api/instances/$IID/start" -H "x-csrf-token: $CSRF_C" > /dev/null 2>&1 &
P1=$!
curl -s --max-time 60 -o "$D/r2" -w '%{http_code}' -b "$C" -X POST "$BASE/api/instances/$IID/stop" -H "x-csrf-token: $CSRF_C" > /dev/null 2>&1 &
P2=$!
wait "$P1" "$P2"
R1=$(cat "$D/r1" 2>/dev/null); R2=$(cat "$D/r2" 2>/dev/null)
{ [ "$R1" != "500" ] && [ "$R2" != "500" ] && [ -n "$R1" ] && [ -n "$R2" ]; } && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 并发操作出现 500 或空响应（R1=$R1 R2=$R2）"; }

# ---- E1：畸形百分号编码路径 → 400 ----
CODE=$(code -b "$J" "$BASE/api/instances/%E0%A4%A")
check "E1 畸形 % 编码路径 400" 400 "$CODE"

echo
echo "===== 安全回归：PASS=$PASS FAIL=$FAIL ====="
[ "$FAIL" = 0 ]
