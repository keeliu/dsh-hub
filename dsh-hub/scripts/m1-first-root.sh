#!/usr/bin/env bash
# M1 专用检查：注册开着的全新库 → 首位注册者自动 root（两者只生效其一：没有 setup 时才触发）。
# 预置方法：先用 node:sqlite 直接建 settings 表并写入 registration_open=open（零依赖），
# 再启动服务（服务端 migrate 会补建其余表），随后首位注册应得 root。
set -u
BASE="http://127.0.0.1:3083"
D="$(mktemp -d)"
HUB_DIR="$D/data"
mkdir -p "$HUB_DIR"
export DSH_HUB_DATA="$HUB_DIR"
export DSH_HUB_PORT=3083
export DSH_HUB_HOST=127.0.0.1

# 预置 registration_open=open（settings 表独立可建，其余表交给服务端 migrate）
node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.DSH_HUB_DATA + "/dshhub.db");
db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("registration_open", "open");
db.close();
'

node --disable-warning=ExperimentalWarning "$(dirname "$0")/../src/index.ts" &
SRV_PID=$!
trap 'kill "$SRV_PID" 2>/dev/null; wait "$SRV_PID" 2>/dev/null; rm -rf "$D"' EXIT

for _ in $(seq 1 20); do
  curl -sf "$BASE/healthz" >/dev/null 2>&1 && break
  sleep 0.3
done

RESP="$(curl -sS -c "$D/cookies" -X POST "$BASE/api/auth/register" \
  -H 'content-type: application/json' -d '{"nickname":"首个用户","password":"User12345"}')"
echo "$RESP" | grep -q '"role":"root"' && echo "[PASS] 首位注册（未 setup）自动 root" || {
  echo "[FAIL] 首位注册未得 root: $RESP"; exit 1; }
echo "$RESP" | grep -q '"slug":"u-' && echo "[PASS] 中文昵称 slug 回退 u-*" || {
  echo "[FAIL] slug 异常: $RESP"; exit 1; }
echo "[OK] m1-first-root 通过"