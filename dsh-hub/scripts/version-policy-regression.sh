#!/usr/bin/env bash
# DSH Hub · DSH 版本策略回归（M2.2）
#
# 覆盖本修复的缺陷：管理员在后台配置的 `default_harness_version` 只在 API 路径生效，
# 网页表单路径直接写 null；并且网页路径绕过 `allowed_harness_versions` 白名单。
#
# 现在两条路径都经过 instances.createInstance → version.resolveHarnessVersion，
# 本脚本分别验证网页路径与 API 路径的四种情形：
#   显式版本 / 回落默认版本 / 白名单拒绝 / 非法 semver 拒绝
# 另加一条：设置页保存非法默认版本必须被拒且不落库。
#
# 用法：cd dsh-hub && TMPDIR=/data/dsh/home/.m2tmp bash scripts/version-policy-regression.sh
set -u

BASE="http://127.0.0.1:3087"
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
    *) echo "[FAIL] $1 — 未包含 '$2'，实得：$(echo "$3" | head -c 200)"; FAIL=$((FAIL + 1));; esac
}

# 只读查询助手（必须在用到它们之前定义：bash 按执行顺序解析函数）
db_query() { # db_query <sql>
  node -e '
const { DatabaseSync } = require("node:sqlite");
const d = new DatabaseSync(process.argv[1]);
console.log(JSON.stringify(d.prepare(process.argv[2]).all()));
' "$HUB_DIR/data/dshhub.db" "$1" 2>/dev/null; }
setting_value() { # setting_value <key>
  node -e '
const { DatabaseSync } = require("node:sqlite");
const d = new DatabaseSync(process.argv[1]);
const r = d.prepare("SELECT value FROM settings WHERE key = ?").get(process.argv[2]);
console.log(r ? String(r.value) : "<missing>");
' "$HUB_DIR/data/dshhub.db" "$1" 2>/dev/null; }
user_field() { # user_field <id> <column>
  node -e '
const { DatabaseSync } = require("node:sqlite");
const d = new DatabaseSync(process.argv[1]);
const r = d.prepare(`SELECT ${process.argv[3]} AS v FROM users WHERE id = ?`).get(process.argv[2]);
console.log(r ? String(r.v) : "<missing>");
' "$HUB_DIR/data/dshhub.db" "$1" "$2" 2>/dev/null; }
ver_of() { # ver_of <instance name>
  node -e '
const { DatabaseSync } = require("node:sqlite");
const d = new DatabaseSync(process.argv[1]);
const r = d.prepare("SELECT harness_version FROM instances WHERE name = ?").get(process.argv[2]);
console.log(r ? String(r.harness_version) : "<missing>");
' "$HUB_DIR/data/dshhub.db" "$1" 2>/dev/null; }

cleanup() {
  [ -n "${HUB_PID:-}" ] && kill "$HUB_PID" 2>/dev/null
  sleep 0.3
  rm -rf "$HUB_DIR" 2>/dev/null
}
trap cleanup EXIT

export DSH_HUB_DATA="$HUB_DIR/data" DSH_HUB_PORT=3087 DSH_HUB_HOST=127.0.0.1
cd "$(dirname "$0")/.."
node --disable-warning=ExperimentalWarning src/index.ts > "$HUB_DIR/hub.log" 2>&1 &
HUB_PID=$!
for _ in $(seq 1 40); do
  curl -sS -m 1 -o /dev/null "$BASE/healthz" 2>/dev/null && break
  sleep 0.3
done

# ---------- 准备管理员 ----------
curl -sS -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/setup" -H 'content-type: application/json' \
  -d '{"nickname":"管理员","username":"admin001","password":"Admin12345"}' -o /dev/null -w ''
CSRF=$(grep dshhub_csrf "$JAR" | awk '{print $7}')
check "准备：取到 CSRF" "yes" "$([ -n "$CSRF" ] && echo yes || echo no)"
# 默认 max_instances=3，本用例要建 10+ 个实例，先放宽配额，
# 否则配额错误（400/403）会掩盖我们要验证的版本错误。
curl -sS -c "$JAR" -b "$JAR" -X PATCH "$BASE/admin/api/users/1" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"max_instances":50,"max_running":50}' -o /dev/null -w ''
check "准备：放宽实例配额到 50" "50" "$(user_field 1 max_instances)"

save_settings() { # save_settings <default_version> <allowed_list>
  curl -sS -c "$JAR" -b "$JAR" -X POST "$BASE/admin/settings" \
    --data-urlencode "_csrf=$CSRF" --data-urlencode "registration_open=on" \
    --data-urlencode "default_harness_version=$1" --data-urlencode "allowed_harness_versions=$2" \
    -o /dev/null -w '%{http_code}'
}
page_create() { # page_create <name> <version>
  curl -sS -c "$JAR" -b "$JAR" -X POST "$BASE/instances" \
    --data-urlencode "_csrf=$CSRF" --data-urlencode "name=$1" --data-urlencode "harness_version=$2" \
    -o "$HUB_DIR/body.html" -w '%{http_code}'
}
api_create() { # api_create <name> <version>
  curl -sS -c "$JAR" -b "$JAR" -X POST "$BASE/api/instances" \
    -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
    -d "{\"name\":\"$1\",\"harness_version\":\"$2\"}" \
    -o "$HUB_DIR/api.json" -w '%{http_code}'
}
# ---------- 1. 无默认版本：网页建实例 → 镜像内置（null） ----------
check "1a 清空默认版本保存" "200" "$(save_settings '' '')"
check "1b 网页建实例（版本留空）" "302" "$(page_create '无默认网页' '')"
check "1c 无默认时 harness_version 为 null" "null" "$(ver_of '无默认网页')"

# ---------- 2. 配了默认版本：网页路径必须生效（本次修复的核心） ----------
check "2a 保存默认版本 0.1.5-rc.2" "200" "$(save_settings '0.1.5-rc.2' '')"
check "2b 网页建实例（版本留空）" "302" "$(page_create '默认网页' '')"
check "2c 网页路径回落到默认版本" "0.1.5-rc.2" "$(ver_of '默认网页')"
check "2d API 路径回落到默认版本" "200" "$(api_create '默认API' '')"
check "2e API 库内版本一致" "0.1.5-rc.2" "$(ver_of '默认API')"

# ---------- 3. 显式版本优先于默认版本（两条路径） ----------
check "3a 网页显式指定版本" "302" "$(page_create '显式网页' '0.2.0-rc.2')"
check "3b 网页显式版本落库" "0.2.0-rc.2" "$(ver_of '显式网页')"
check "3c API 显式指定版本" "200" "$(api_create '显式API' '0.2.0-rc.2')"
check "3d API 显式版本落库" "0.2.0-rc.2" "$(ver_of '显式API')"

# ---------- 4. 白名单：网页路径不得再绕过 ----------
check "4a 白名单限定为 0.1.5-rc.2" "200" "$(save_settings '0.1.5-rc.2' '0.1.5-rc.2')"
check "4b 网页提交白名单外版本 → 400" "400" "$(page_create '绕白名单' '0.2.0-rc.2')"
check_contains "4c 网页错误提示说明不在白名单" "不在管理员允许的版本列表中" "$(cat "$HUB_DIR/body.html")"
check "4d 白名单外实例未被创建" "<missing>" "$(ver_of '绕白名单')"
check "4e API 提交白名单外版本 → 403" "403" "$(api_create '绕白名单API' '0.2.0-rc.2')"
check_contains "4f API 错误码为 harness_version_not_allowed" "harness_version_not_allowed" "$(cat "$HUB_DIR/api.json")"
check "4g 网页提交白名单内版本 → 302" "302" "$(page_create '白名单内' '0.1.5-rc.2')"
check "4h 白名单内版本落库" "0.1.5-rc.2" "$(ver_of '白名单内')"

# ---------- 5. 非法 semver 拒绝（此前会变成任意 npm spec） ----------
check "5a 网页提交 file:/etc → 400" "400" "$(page_create '非法网页' 'file:/etc')"
check_contains "5b 网页错误提示要求显式 semver" "不是合法的显式 semver" "$(cat "$HUB_DIR/body.html")"
check "5c 非法版本实例未被创建" "<missing>" "$(ver_of '非法网页')"
check "5d API 提交 file:/etc → 400" "400" "$(api_create '非法API' 'file:/etc')"
check_contains "5e API 错误码为 invalid_harness_version" "invalid_harness_version" "$(cat "$HUB_DIR/api.json")"

# ---------- 6. 设置页保存非法默认版本必须被拒且不落库 ----------
check "6a 保存非法默认版本 → 400" "400" "$(save_settings 'not-a-version' '')"
check "6b 非法默认版本未落库（仍是上一步的合法值）" "0.1.5-rc.2" "$(setting_value default_harness_version)"
check "6c 保存非法白名单 → 400" "400" "$(save_settings '0.1.5-rc.2' 'file:/etc')"
check "6d 清空默认版本后网页回落为镜像内置" "200" "$(save_settings '' '')"
check "6e 网页建实例" "302" "$(page_create '清空后' '')"
check "6f 无默认版本时为 null" "null" "$(ver_of '清空后')"

echo "===== 版本策略回归：PASS=$PASS FAIL=$FAIL ====="
[ "$FAIL" = 0 ]
