#!/usr/bin/env bash
# M1 冒烟测试：setup → session/CSRF → register → 角色 → 封禁 → token → 限速 → 审计
# 用法：bash scripts/m1-smoke.sh [BASE_URL]
#   - 默认自带启动 hub（3082，临时数据根；M2.1 对齐 m2-smoke，防误跑）
#   - 也可传 BASE_URL 指向已运行的服务（此时不启动、不清理）
set -u
BASE="${1:-http://127.0.0.1:3082}"
D="$(mktemp -d)"
J="$D/admin.jar"; Z="$D/zhang.jar"; L="$D/li.jar"
HUB_DIR="$(mktemp -d)"
HUB_PID=""
trap 'rm -rf "$D" "$HUB_DIR"; [ -n "$HUB_PID" ] && kill "$HUB_PID" 2>/dev/null' EXIT

start_hub() {
  DSH_HUB_DATA="$HUB_DIR/data" DSH_HUB_PORT=3082 DSH_HUB_HOST=127.0.0.1 \
    node --disable-warning=ExperimentalWarning src/index.ts >>"$HUB_DIR/hub.out.log" 2>&1 &
  HUB_PID=$!
  for _ in $(seq 1 30); do curl -sf "$BASE/healthz" >/dev/null 2>&1 && return 0; sleep 0.3; done
  echo "  [hub 启动失败]" >&2; tail -20 "$HUB_DIR/hub.out.log" >&2; return 1
}

# 默认地址且目标未就绪 → 自动拉起 hub
if [ "$BASE" = "http://127.0.0.1:3082" ] && ! curl -sf "$BASE/healthz" >/dev/null 2>&1; then
  cd "$(dirname "$0")/.." || exit 1
  start_hub || exit 1
fi

PASS=0; FAIL=0
check() { # check <desc> <expected_code> <actual_code>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "[PASS] $1";
  else FAIL=$((FAIL+1)); echo "[FAIL] $1 — expected $2 got $3"; fi
}
post() { curl -sS -o "$D/body" -w '%{http_code}' "$@"; BODY="$(cat "$D/body")"; }
postb() { post "$@"; }

# 1) setup 建管理员（首个账号）
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -c "$J" -X POST "$BASE/api/auth/setup" \
  -H 'content-type: application/json' -d '{"nickname":"管理员","password":"Admin12345"}')
check "setup 建管理员" 200 "$CODE"
echo "   body: $(head -c 120 "$D/body")"

# 2) 再 setup → 403
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -X POST "$BASE/api/auth/setup" \
  -H 'content-type: application/json' -d '{"nickname":"x","password":"Admin12345"}')
check "setup 仅限首启" 403 "$CODE"

# 3) 会话 /api/me
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -b "$J" "$BASE/api/me")
check "会话 /api/me" 200 "$CODE"
grep -q '"role":"admin"' "$D/body" && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] me 角色 admin"; }

# 4) 注册默认关闭
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H 'content-type: application/json' -d '{"nickname":"张三","password":"User12345"}')
check "注册默认关闭" 403 "$CODE"

# 5) 管理员开注册
CSRF_J=$(awk '/dshhub_csrf/{print $7}' "$J")
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -b "$J" -X PUT "$BASE/admin/api/settings" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_J" -d '{"registration_open":"open"}')
check "管理员开启注册" 200 "$CODE"

# 6) 无 CSRF 的写操作 → 403
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -b "$J" -X PUT "$BASE/admin/api/settings" \
  -H 'content-type: application/json' -d '{"registration_open":"closed"}')
check "写操作缺 CSRF 拒绝" 403 "$CODE"

# 7) 首个注册者（此时 setup 已建管理员 ⇒ 非首次账号 ⇒ 角色 user）
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -c "$Z" -X POST "$BASE/api/auth/register" \
  -H 'content-type: application/json' -d '{"nickname":"张三","password":"User12345"}')
check "首位注册（setup 后）为 user" 200 "$CODE"
grep -q '"role":"user"' "$D/body" && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 张三应为 user（setup 已建管理员，root 兜底不触发）"; }
grep -q '"slug":"u-' "$D/body" && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 中文昵称 slug 应回退 u-*（零依赖无语音）"; }

# 8) 第二位注册 → user
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -c "$L" -X POST "$BASE/api/auth/register" \
  -H 'content-type: application/json' -d '{"nickname":"李四","password":"User12345"}')
check "第二位注册为 user" 200 "$CODE"

# 9) user 不能访问 admin API
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -b "$L" "$BASE/admin/api/users")
check "普通用户访问管理 API" 403 "$CODE"

# 10) user 不能建 admin
CSRF_L=$(awk '/dshhub_csrf/{print $7}' "$L")
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -b "$L" -X POST "$BASE/admin/api/users" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_L" \
  -d '{"nickname":"王五","password":"User12345","role":"admin"}')
check "普通用户不可建 admin" 403 "$CODE"

# 11) admin 建 user（王五）
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -b "$J" -X POST "$BASE/admin/api/users" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_J" \
  -d '{"nickname":"王五","password":"User12345","role":"user"}')
check "admin 建 user" 200 "$CODE"

# 12) admin 封禁 user（李四 id=3）
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -b "$J" -X PATCH "$BASE/admin/api/users/3" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_J" -d '{"status":"disabled"}')
check "admin 封禁李四" 200 "$CODE"

# 13) 封禁后登录被拒
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d '{"nickname":"李四","password":"User12345"}')
check "封禁账号登录被拒" 403 "$CODE"

# 14) API token 签发 + Bearer 访问
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -b "$J" -X POST "$BASE/api/me/tokens" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_J" -d '{"name":"ci"}')
check "签发 API token" 200 "$CODE"
TOKEN=$(python3 -c "import json,sys; print(json.load(open('$D/body'))['token'])" 2>/dev/null || grep -o '"token":"[^"]*"' "$D/body" | cut -d'"' -f4)
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE/api/me")
check "Bearer 访问 /api/me" 200 "$CODE"

# 15) 登录限速：前 5 次错误都 401，第 6 次起被锁（第 5 次失败才置锁，下一次请求生效）
i=1
while [ $i -le 5 ]; do
  CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -X POST "$BASE/api/auth/login" \
    -H 'content-type: application/json' -d '{"nickname":"王五","password":"WrongPass99"}')
  i=$((i+1))
done
check "登录前 5 次错均 401" 401 "$CODE"
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d '{"nickname":"王五","password":"WrongPass99"}')
check "登录限速（5 次错后锁 15 分钟）" 429 "$CODE"

# 16) 审计可查（管理员）
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -b "$J" "$BASE/admin/api/audit?limit=50")
check "审计列表" 200 "$CODE"
grep -q '"action"' "$D/body" && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 审计含 action"; }

# 17) 注销（写操作需 CSRF，M2.1）
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -b "$J" -X POST "$BASE/api/auth/logout" -H "x-csrf-token: $CSRF_J")
check "注销" 200 "$CODE"
CODE=$(curl -sS -o "$D/body" -w '%{http_code}' -b "$J" "$BASE/api/me")
check "注销后 /api/me 拒绝" 401 "$CODE"

echo
echo "===== M1 冒烟：PASS=$PASS FAIL=$FAIL ====="
[ "$FAIL" = 0 ]