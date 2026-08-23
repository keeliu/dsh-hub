#!/usr/bin/env bash
# M2 冒烟：昵称目录 + 实例生命周期（真实 dsh web 实例）。
# 流程：全新库 → setup → 建实例(校验目录/700) → 启动(TCP+HTTP) → 第二实例并行 →
#       stop(端口释放) → restart → 配额(max_instances/max_running) → 杀监督器后 reclaim →
#       delete(目录删除)。
# 用法：cd dsh-hub && bash scripts/m2-smoke.sh   （默认端口 3082；INSTANCES_READY_TIMEOUT 可调）
set -u
BASE="${1:-http://127.0.0.1:3082}"
HUB_DIR="$(mktemp -d)"
CONTROL=3082
export DSH_HUB_DATA="$HUB_DIR/data"
export DSH_HUB_PORT=$CONTROL
export DSH_HUB_HOST=127.0.0.1

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "[PASS] $1"; else FAIL=$((FAIL+1)); echo "[FAIL] $1 — expected $2 got $3"; fi; }
say()  { echo "[....] $1"; }

cleanup() { [ -n "${HUB_PID:-}" ] && kill "$HUB_PID" 2>/dev/null; [ -n "${HUB_PID2:-}" ] && kill "$HUB_PID2" 2>/dev/null; rm -rf "$HUB_DIR"; }
trap cleanup EXIT

start_hub() {
  node --disable-warning=ExperimentalWarning src/index.ts >>"$HUB_DIR/hub.out.log" 2>&1 &
  HUB_PID=$!
  for _ in $(seq 1 30); do curl -sf "$BASE/healthz" >/dev/null 2>&1 && return 0; sleep 0.3; done
  echo "  [hub 启动失败]" >&2; tail -20 "$HUB_DIR/hub.out.log" >&2; return 1
}

cd "$(dirname "$0")/.." || exit 1
J="$HUB_DIR/admin.jar"
D="$HUB_DIR/tmp"

start_hub || exit 1

# 1) setup 建管理员
CODE=$(curl -sS -o "$D.setup" -w '%{http_code}' -c "$J" -X POST "$BASE/api/auth/setup" \
  -H 'content-type: application/json' -d '{"nickname":"管理员","password":"Admin12345"}')
check "setup 建管理员" 200 "$CODE"
CSRF=$(awk '/dshhub_csrf/{print $7}' "$J")

# 2) 建实例 1：校验用户目录 700 + 实例目录
RESP=$(curl -sS -b "$J" -X POST "$BASE/api/instances" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF" -d '{"name":"主力实例"}')
echo "$RESP" | grep -q '"status":"stopped"' && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 实例创建即 stopped"; }
I1=$(echo "$RESP" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
P1=$(echo "$RESP" | grep -o '"port":[0-9]*' | cut -d: -f2)
echo "$RESP" | grep -q '"trusted_host":"[^"]*-'"$I1"'.dshhub.local"' && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] trusted_host 应为 <slug>-<id>.dshhub.local"; }
UPERM=$(stat -c '%a' "$HUB_DIR/data/users/"* 2>/dev/null | head -1)
[ "$UPERM" = "700" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 用户目录权限应为 700，实际 $UPERM"; }
for sub in home workspace logs; do
  [ -d "$HUB_DIR/data/users/管理员/instances/$I1/$sub" ] || { FAIL=$((FAIL+1)); echo "[FAIL] 缺实例子目录 $sub"; }
done
# 未启动前不应有 pidfile（M2.1：原断言恒真，修正为真实断言）
[ ! -f "$HUB_DIR/data/users/管理员/instances/$I1/instance.pid" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 未启动不应有 pidfile"; }
say "实例1 id=$I1 port=$P1"

# 3) 启动实例 1：等 TCP/HTTP 就绪
CODE=$(curl -sS -o "$D.start1" -w '%{http_code}' -b "$J" -X POST "$BASE/api/instances/$I1/start" \
  -H "x-csrf-token: $CSRF")
check "start 实例1" 200 "$CODE"
READY=0
for _ in $(seq 1 180); do
  if curl -sf "http://127.0.0.1:$P1/" -o "$D.shell1" 2>/dev/null; then READY=1; break; fi
  sleep 0.5
done
[ "$READY" = 1 ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 实例1 HTTP 未就绪"; }
grep -q "__DSH_BOOT__" "$D.shell1" 2>/dev/null && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 实例1 壳 HTML 缺 __DSH_BOOT__"; }
say "实例1 HTTP 就绪（__DSH_BOOT__ 注入 OK）"

# 4) 建 + 启动实例 2（并行验证互不干扰）。默认 max_running=1，先升到 2。
MID=$(curl -sS -b "$J" "$BASE/api/me" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
CODE=$(curl -sS -o "$D.qmax" -w '%{http_code}' -b "$J" -X PATCH "$BASE/admin/api/users/$MID" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" -d '{"max_running":2}')
check "管理层设 max_running=2（允许并行）" 200 "$CODE"
RESP2=$(curl -sS -b "$J" -X POST "$BASE/api/instances" -H 'content-type: application/json' \
  -H "x-csrf-token: $CSRF" -d '{"name":"测试实例"}')
I2=$(echo "$RESP2" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
P2=$(echo "$RESP2" | grep -o '"port":[0-9]*' | cut -d: -f2)
[ "$P1" != "$P2" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 两实例端口冲突"; }
CODE=$(curl -sS -o "$D.start2" -w '%{http_code}' -b "$J" -X POST "$BASE/api/instances/$I2/start" \
  -H "x-csrf-token: $CSRF")
check "start 实例2" 200 "$CODE"
READY=0
for _ in $(seq 1 180); do
  if curl -sf "http://127.0.0.1:$P2/" -o /dev/null 2>/dev/null; then READY=1; break; fi
  sleep 0.5
done
[ "$READY" = 1 ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 实例2 HTTP 未就绪"; }
[ "$(curl -sf "http://127.0.0.1:$P1/" -o /dev/null -w '%{http_code}')" = "200" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 实例1 仍应可用"; }
say "双实例并行 OK（$P1 / $P2）"

# 5) stop 实例1：端口释放
CODE=$(curl -sS -o "$D.stop1" -w '%{http_code}' -b "$J" -X POST "$BASE/api/instances/$I1/stop" \
  -H "x-csrf-token: $CSRF")
check "stop 实例1" 200 "$CODE"
OPEN=1
for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$P1/" -o /dev/null 2>/dev/null || { OPEN=0; break; }; sleep 0.3; done
[ "$OPEN" = 0 ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] stop 后端口未释放"; }

# 6) restart 实例1
CODE=$(curl -sS -o "$D.restart1" -w '%{http_code}' -b "$J" -X POST "$BASE/api/instances/$I1/restart" \
  -H "x-csrf-token: $CSRF")
check "restart 实例1" 200 "$CODE"
READY=0
for _ in $(seq 1 180); do
  if curl -sf "http://127.0.0.1:$P1/" -o /dev/null 2>/dev/null; then READY=1; break; fi
  sleep 0.5
done
[ "$READY" = 1 ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] restart 后未恢复"; }

# 7) 配额 max_running=1：实例1在跑，再 start 实例2 → 403
#    （实例2当前也在跑，先 stop 它，把 max_running 设为 1，再 start → 应 403）
CODE=$(curl -sS -o "$D.stop2" -w '%{http_code}' -b "$J" -X POST "$BASE/api/instances/$I2/stop" \
  -H "x-csrf-token: $CSRF")
check "先停实例2（准备配额测试）" 200 "$CODE"
# 获取管理员 id
MID=$(curl -sS -b "$J" "$BASE/api/me" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
CODE=$(curl -sS -o "$D.q1" -w '%{http_code}' -b "$J" -X PATCH "$BASE/admin/api/users/$MID" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" -d '{"max_running":1}')
check "管理层设 max_running=1" 200 "$CODE"
CODE=$(curl -sS -o "$D.start2q" -w '%{http_code}' -b "$J" -X POST "$BASE/api/instances/$I2/start" \
  -H "x-csrf-token: $CSRF")
check "max_running=1 时并发启动被拒" 403 "$CODE"
grep -q 'quota_exceeded' "$D.start2q" && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 应返回 quota_exceeded"; }

# 8) 配额 max_instances：把上限设 2，再建第 3 个 → 403
CODE=$(curl -sS -o "$D.q2" -w '%{http_code}' -b "$J" -X PATCH "$BASE/admin/api/users/$MID" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" -d '{"max_instances":2}')
check "管理层设 max_instances=2" 200 "$CODE"
CODE=$(curl -sS -o "$D.create3" -w '%{http_code}' -b "$J" -X POST "$BASE/api/instances" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" -d '{"name":"第三"}')
check "max_instances=2 时建第 3 个被拒" 403 "$CODE"
grep -q 'quota_exceeded' "$D.create3" && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 应返回 quota_exceeded"; }

# 9) 杀监督器（hub 进程）→ 实例仍跑 → 重启 hub → reclaim 认领为 running
KILLED_HUB=$HUB_PID
kill -9 "$KILLED_HUB" 2>/dev/null
wait "$KILLED_HUB" 2>/dev/null
OLD_PID=$(cat "$HUB_DIR/data/users/管理员/instances/$I1/instance.pid")
kill -0 "$OLD_PID" 2>/dev/null && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 监督器被杀后实例进程应存活（setsid 独立进程组）"; }
sleep 1
start_hub || { echo "[FAIL] hub 重启失败"; exit 1; }
CODE=$(curl -sS -o "$D.reclaim" -w '%{http_code}' -b "$J" "$BASE/admin/api/instances")
check "重启后管理总览可查" 200 "$CODE"
grep -q "\"id\":\"$I1\"" "$D.reclaim" || { FAIL=$((FAIL+1)); echo "[FAIL] 实例1 仍在"; }
STATUS1=$(echo "$D.reclaim.x" >/dev/null; curl -sS -b "$J" "$BASE/api/instances/$I1" | grep -o '"status":"[^"]*"' | head -1)
echo "$STATUS1" | grep -q running && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] reclaim 后实例1应为 running，实得 $STATUS1"; }
say "orphan reclaim OK（实例1 保持 running）"

# 10) 删除实例：先 stop 再 delete，目录应消失
CODE=$(curl -sS -o "$D.del1" -w '%{http_code}' -b "$J" -X DELETE "$BASE/api/instances/$I1" \
  -H "x-csrf-token: $CSRF")
check "删除实例1" 200 "$CODE"
[ ! -d "$HUB_DIR/data/users/管理员/instances/$I1" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "[FAIL] 删除后目录应移除"; }

echo
echo "===== M2 冒烟：PASS=$PASS FAIL=$FAIL ====="
[ "$FAIL" = 0 ]