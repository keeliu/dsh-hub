#!/usr/bin/env bash
# DSH Hub · 实例插件树 × dsh 版本一致性回归（M2.3）
#
# 覆盖缺陷：插件树由**镜像内置 dsh** materialize，实例却可能用
# `npx @deepseek-ai/dsh@<版本>` 启动 → `dsh: plugin tree failed to load:
# @deepseek-ai/dsh-sandbox-local`（生产实测，见 i-fb7cf4d9）。
#
# 修复后：装树与启动必须用**同一份** dsh（`config.resolveDshCommand`）：
#   - 未指定版本 / 版本 === 内置版本 → 内置二进制（模板同源，省一次 npx 下载）
#   - 其他版本 → `npx --yes @deepseek-ai/dsh@<版本>`
# 且 `.plugins-installed` 记录装树版本，启动期不一致就删树重装（自愈既有坏实例）。
#
# 用例：
#   T1 内置版本实例：真装成功 → 标记记内置版本 → 能启动
#   T2 标记版本被篡改（模拟「树是别的 dsh 版本装出来的」）→ 启动期自动重装并恢复
#   T3 指定非内置版本：跳过模板、改用 npx 该版本装树 → 标记记该版本 → 同一版本启动
#
# 用法：cd dsh-hub && TMPDIR=<大容量盘，勿用 /tmp> bash scripts/version-tree-regression.sh
# 【必须】TMPDIR 指向大容量盘：/tmp 常是 256M tmpfs，一个实例的插件树就近 250M。
set -u
# T3 的「非内置版本」样本。要求：①合法且已发布；②与镜像内置版本不同（否则退化成内置路径）；
# ③其 peer 面在当前 npm registry 状态下**装得起来**。
# 原用 0.1.5-rc.2（上一基线），2026-10 起该组合已跑不通：测试期插件清单里的 dshmarket 装的是
# **latest**（1.66.17），它声明 `@deepseek-ai/dsh-settings: ^0.1.0-rc.7 || ^0.1.1-rc.2 ||
# ^0.1.2-alpha.2 || ^0.2.0-rc.1`；按 semver 预发布规则，0.1.5-rc.2 不被其中任何一段覆盖
# → 插件树加载失败、实例虽 running 但端口不可访问（T3i 实测失败）。
# 改用 0.2.0-rc.1：与内置 0.2.0-rc.2 同线但不同版本，且满足上述 `^0.2.0-rc.1`。
T3_VERSION="${T3_VERSION:-0.2.0-rc.1}"

BASE="http://127.0.0.1:3086"
HUB_DIR="$(mktemp -d)"
JAR="$HUB_DIR/admin.jar"
PASS=0
FAIL=0

check() { # check <desc> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "[PASS] $1"; PASS=$((PASS + 1));
  else echo "[FAIL] $1 — expected $2 got $3"; FAIL=$((FAIL + 1)); fi
}
check_contains() { # check_contains <desc> <needle> <haystack>
  case "$3" in *"$2"*) echo "[PASS] $1"; PASS=$((PASS + 1));;
    *) echo "[FAIL] $1 — 未包含 '$2'，实得：$(printf '%s' "$3" | head -c 200)"; FAIL=$((FAIL + 1));; esac
}

# 只读查询助手（bash 按执行顺序解析函数，必须在调用前定义）
db_q() { # db_q <sql>
  node -e '
const { DatabaseSync } = require("node:sqlite");
const d = new DatabaseSync(process.argv[1]);
console.log(JSON.stringify(d.prepare(process.argv[2]).all()));
' "$HUB_DIR/data/dshhub.db" "$1" 2>/dev/null; }
inst_field() { # inst_field <name> <column>
  node -e '
const { DatabaseSync } = require("node:sqlite");
const d = new DatabaseSync(process.argv[1]);
const r = d.prepare(`SELECT ${process.argv[3]} AS v FROM instances WHERE name = ?`).get(process.argv[2]);
console.log(r ? String(r.v) : "<missing>");
' "$HUB_DIR/data/dshhub.db" "$1" "$2" 2>/dev/null; }
marker_of() { # marker_of <instance name>
  local home; home="$(inst_field "$1" home_path)"
  [ -f "$home/.plugins-installed" ] && cat "$home/.plugins-installed" || echo "<no-marker>"; }

wait_status() { # wait_status <name> <status> <seconds>
  local i=0 n=$(( $3 * 2 ))
  while [ "$i" -lt "$n" ]; do
    [ "$(inst_field "$1" status)" = "$2" ] && return 0
    sleep 0.5; i=$((i + 1))
  done
  return 1
}
wait_marker() { # wait_marker <instance name> <seconds>
  local i=0 n=$(( $2 * 2 ))
  while [ "$i" -lt "$n" ]; do
    [ "$(marker_of "$1")" != "<no-marker>" ] && return 0
    sleep 0.5; i=$((i + 1))
  done
  return 1
}
wait_http() { # wait_http <port> <seconds>
  local i=0 n=$(( $2 * 2 ))
  while [ "$i" -lt "$n" ]; do
    [ "$(curl -sS -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1/" 2>/dev/null)" = "200" ] && return 0
    sleep 0.5; i=$((i + 1))
  done
  return 1
}

# 杀掉一切与本次临时数据根相关的进程（含实例自身的 dsh web）
kill_stragglers() {
  for p in /proc/[0-9]*; do
    local pid="${p#/proc/}" c l
    c="$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null)"
    l="$(readlink "$p/cwd" 2>/dev/null)"
    case "$c$l" in *"$HUB_DIR"*) kill -9 "$pid" 2>/dev/null;; esac
  done
}
cleanup() {
  [ -n "${HUB_PID:-}" ] && kill "$HUB_PID" 2>/dev/null
  sleep 0.3
  kill_stragglers
  rm -rf "$HUB_DIR" 2>/dev/null
}
trap cleanup EXIT

export DSH_HUB_DATA="$HUB_DIR/data" DSH_HUB_PORT=3086 DSH_HUB_HOST=127.0.0.1
cd "$(dirname "$0")/.."
node --disable-warning=ExperimentalWarning src/index.ts > "$HUB_DIR/hub.log" 2>&1 &
HUB_PID=$!
for _ in $(seq 1 40); do
  curl -sS -m 1 -o /dev/null "$BASE/healthz" 2>/dev/null && break
  sleep 0.3
done

# ---------- 准备：管理员 + 放宽配额 + 把预置清单缩到本地可装成功的单插件 ----------
curl -sS -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/setup" -H 'content-type: application/json' \
  -d '{"nickname":"管理员","username":"admin001","password":"Admin12345"}' -o /dev/null
CSRF=$(grep dshhub_csrf "$JAR" | awk '{print $7}')
check "准备：取到 CSRF" "yes" "$([ -n "$CSRF" ] && echo yes || echo no)"
curl -sS -c "$JAR" -b "$JAR" -X PATCH "$BASE/admin/api/users/1" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"max_instances":10,"max_running":10}' -o /dev/null
# 默认清单里的 `@nagi-ovo/dsh-visualize` 在 0.2.0-rc.2 上可装，但整棵 5 插件模板安装耗时太长，
# 会让「全部成功才写标记」的等待变得很慢，干扰本回归；缩到 dshmarket 单插件。
# （注意：官方 `dsh-visualize@0.2.1` 在 0.2.0-rc.2 上会被 dsh **拒绝安装**，已从默认清单移除。）
curl -sS -c "$JAR" -b "$JAR" -X PUT "$BASE/admin/api/preset-plugins" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"plugins":[{"spec":"dshmarket","enabled":true,"order":0,"allowBuild":false,"workspace":false}]}' -o /dev/null
check "准备：预置清单只剩 dshmarket" "1" "$(db_q 'SELECT key FROM settings' | grep -c preset_plugins)"

BUILTIN="$(node -e 'console.log(require("/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json").version)')"
echo "[info] 本机内置 dsh 版本 = $BUILTIN；模板目录 $( [ -d /opt/dsh-home-template ] && echo 存在 || echo 不存在)（本地开发机通常不存在）"

api_create() { # api_create <name> <version>
  curl -sS -c "$JAR" -b "$JAR" -X POST "$BASE/api/instances" \
    -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
    -d "{\"name\":\"$1\",\"harness_version\":\"$2\"}" -o "$HUB_DIR/create.json" -w '%{http_code}'
}
api_start() { # api_start <id>
  curl -sS -c "$JAR" -b "$JAR" -X POST "$BASE/api/instances/$1/start" \
    -H "x-csrf-token: $CSRF" -o "$HUB_DIR/start.json" -w '%{http_code}'
}

# ---------- T1 内置版本实例：真装 → 标记记内置版本 → 启动 ----------
check "T1a 建实例（不指定版本）" "200" "$(api_create '内置版' '')"
check "T1b harness_version 为 null" "null" "$(inst_field '内置版' harness_version)"
if wait_marker '内置版' 900; then echo "[PASS] T1c 插件安装完成并写入标记"; PASS=$((PASS + 1));
else echo "[FAIL] T1c 900s 内未见 .plugins-installed"; FAIL=$((FAIL + 1)); fi
check_contains "T1d 标记记录的版本 = 内置版本 $BUILTIN" "\"version\":\"$BUILTIN\"" "$(marker_of '内置版')"
check_contains "T1e 用的是内置安装器" "Plugin installer for" "$(cat "$HUB_DIR/hub.log")"
IP1="$(inst_field '内置版' id)"; P1="$(inst_field '内置版' port)"
check "T1f 启动" "200" "$(api_start "$IP1")"
check "T1g 状态 running" "0" "$(wait_status '内置版' running 240 && echo 0 || echo 1)"
check "T1h 实例端口可访问" "0" "$(wait_http "$P1" 120 && echo 0 || echo 1)"

# ---------- T2 篡改标记版本（模拟「树是别的 dsh 版本装出来的」）→ 启动期自愈 ----------
curl -sS -c "$JAR" -b "$JAR" -X POST "$BASE/api/instances/$IP1/stop" -H "x-csrf-token: $CSRF" -o /dev/null
wait_status '内置版' stopped 60
printf '{"version":"0.0.0-fake","at":"2000-01-01T00:00:00.000Z"}\n' > "$(inst_field '内置版' home_path)/.plugins-installed"
check_contains "T2a 标记已被篡改为 0.0.0-fake" "0.0.0-fake" "$(marker_of '内置版')"
check "T2b 再次启动" "200" "$(api_start "$IP1")"
check "T2c 状态 running（自愈后仍能启动）" "0" "$(wait_status '内置版' running 600 && echo 0 || echo 1)"
check_contains "T2d 日志出现重建" "重建插件树" "$(cat "$HUB_DIR/hub.log")"
check_contains "T2e 标记被恢复为 $BUILTIN" "\"version\":\"$BUILTIN\"" "$(marker_of '内置版')"

# ---------- T3 指定非内置版本：跳过模板 + npx 该版本装树 + 同版本启动 ----------
# 样本版本见文件头部 T3_VERSION 的说明（可用环境变量覆盖，便于验证其他版本）。
check "T3a 建实例（指定 $T3_VERSION）" "200" "$(api_create '指定版' "$T3_VERSION")"
IP3="$(inst_field '指定版' id)"; P3="$(inst_field '指定版' port)"
check_contains "T3b 跳过模板（版本与内置不一致）" "跳过模板" "$(cat "$HUB_DIR/hub.log")"
check_contains "T3c 安装器用 npx 指定版本" "npx --yes @deepseek-ai/dsh@$T3_VERSION" "$(cat "$HUB_DIR/hub.log")"
if wait_marker '指定版' 1200; then echo "[PASS] T3d 该版本装树完成并写入标记"; PASS=$((PASS + 1));
else echo "[FAIL] T3d 1200s 内未见 .plugins-installed"; FAIL=$((FAIL + 1)); fi
check_contains "T3e 标记记录 $T3_VERSION" "\"version\":\"$T3_VERSION\"" "$(marker_of '指定版')"
check "T3f 启动" "200" "$(api_start "$IP3")"
check "T3g 状态 running" "0" "$(wait_status '指定版' running 300 && echo 0 || echo 1)"
PID3="$(inst_field '指定版' pid)"
CMDLINE="$(tr '\0' ' ' < "/proc/$PID3/cmdline" 2>/dev/null)"
check_contains "T3h 进程命令行用的是同一版本（npx @$T3_VERSION）" "@deepseek-ai/dsh@$T3_VERSION" "$CMDLINE"
check "T3i 实例端口可访问" "0" "$(wait_http "$P3" 300 && echo 0 || echo 1)"

echo "===== 版本一致性回归：PASS=$PASS FAIL=$FAIL ====="
[ "$FAIL" = 0 ]
