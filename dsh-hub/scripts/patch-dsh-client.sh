#!/bin/sh
# DSH Patch
#  1) 客户端 loopback 补丁（client.js）：让网关访问实例设置页
#  2) 浏览器鉴权旁路（index.js）：dsh 0.1.5 起（基线 0.2.0-rc.2 沿用）给 index/API 加了 launch-token/cookie 鉴权；
#     部分构建没有 ONEPANEL_DSH_AUTH_PROXY 环境变量旁路，网关（服务器端 fetch）拿不到
#     cookie 就会被 401（现象：dsh web authentication required）。
# 安全性：dsh-hub 已完成鉴权 + 所有权 + 会员校验，且实例仅监听 127.0.0.1。
#
# 用法：patch-dsh-client.sh [<node_modules 根目录> ...]
#   不带参数：补内置 dsh（/usr/local/lib/node_modules，容器启动时执行）
#   带参数  ：补指定根目录下的所有 dsh-client-connection 副本。hub 用
#            `npx @deepseek-ai/dsh@<版本>` 启动实例前会传该 npx 缓存的 node_modules ——
#            那一份 dsh 是 npx 现下载的原始包，**不在镜像里**，启动期补丁覆盖不到它，
#            不补就是「实例状态 running、工作区打开 401」（见 src/npx-dsh.ts）。
set -e

ROOTS="$*"
[ -n "$ROOTS" ] || ROOTS="/usr/local/lib/node_modules"

FOUND_CLIENT=0
FOUND_INDEX=0

for ROOT in $ROOTS; do
  if [ ! -d "$ROOT" ]; then
    echo "[patch] WARN: 目录不存在，跳过：$ROOT" >&2
    continue
  fi

  # ========== 1) 客户端 loopback 补丁 (client.js) ==========
  for DSH_CLIENT_JS in $(find "$ROOT" -path "*/dsh-client-connection/lib/client.js" -type f 2>/dev/null); do
    FOUND_CLIENT=$((FOUND_CLIENT + 1))
    echo "[patch] client.js: $DSH_CLIENT_JS"
    if grep -q "isLoopback: true" "$DSH_CLIENT_JS"; then
      echo "[patch] client.js already patched (loopback)"
      continue
    fi
    # 使用 node 精确替换（避免 sed 特殊字符问题）
    node -e "
const fs = require('fs');
const file = process.argv[1];
let src = fs.readFileSync(file, 'utf8');
// 新版写法
const newPattern = 'isLoopback: transport?.ownsHost === true || pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname)';
// 旧版写法
const oldPattern = 'isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname)';
let patched = false;
if (src.includes(newPattern)) { src = src.split(newPattern).join('isLoopback: true'); patched = true; console.log('[patch] Matched new-style isLoopback pattern'); }
else if (src.includes(oldPattern)) { src = src.split(oldPattern).join('isLoopback: true'); patched = true; console.log('[patch] Matched old-style isLoopback pattern'); }
if (!patched) {
  const lines = src.split('\n');
  lines.forEach((l, i) => { if (l.includes('isLoopback:') && !l.includes('isLoopbackHostname')) console.error('[patch] Actual isLoopback line ' + (i+1) + ': ' + l.trim()); });
  console.error('[patch] ERROR: 未找到 client.js 的 isLoopback 补丁目标');
  process.exit(1);
}
fs.writeFileSync(file, src);
console.log('[patch] Successfully patched client.js loopback check');
" "$DSH_CLIENT_JS"

    grep -q "isLoopback: true" "$DSH_CLIENT_JS" || { echo "[patch] ERROR: client.js 补丁验证失败：$DSH_CLIENT_JS" >&2; exit 1; }
  done

  # ========== 2) 浏览器鉴权旁路 (index.js) ==========
  for DSH_CONN_INDEX in $(find "$ROOT" -path "*/dsh-client-connection/lib/index.js" -type f 2>/dev/null); do
    FOUND_INDEX=$((FOUND_INDEX + 1))
    echo "[patch] index.js: $DSH_CONN_INDEX"
    if grep -q "isAuthenticated(request) { return true;" "$DSH_CONN_INDEX"; then
      echo "[patch] index.js already patched (browser-auth bypass)"
    elif grep -q "ONEPANEL_DSH_AUTH_PROXY" "$DSH_CONN_INDEX"; then
      # 该构建有 env 旁路；运行时已注入 ONEPANEL_DSH_AUTH_PROXY=1，无需改代码
      echo "[patch] index.js has ONEPANEL_DSH_AUTH_PROXY bypass (env-controlled); no code patch"
    else
      # 把 isAuthenticated 直接置真：在方法体开头注入 return true;（其余为不可达但语法合法的死代码）
      node -e "
const fs = require('fs');
const file = process.argv[1];
let src = fs.readFileSync(file, 'utf8');
const anchor = 'isAuthenticated(request) {';
const patchedAnchor = 'isAuthenticated(request) { return true;';
if (src.includes(patchedAnchor)) { console.log('[patch] index.js already patched'); process.exit(0); }
if (!src.includes(anchor)) { console.error('[patch] ERROR: 未找到 index.js 的 isAuthenticated(request) { 锚点'); process.exit(1); }
src = src.split(anchor).join(patchedAnchor);
fs.writeFileSync(file, src);
console.log('[patch] Successfully patched index.js browser-auth bypass');
" "$DSH_CONN_INDEX"

      grep -q "isAuthenticated(request) { return true;" "$DSH_CONN_INDEX" || { echo "[patch] ERROR: index.js 鉴权补丁验证失败：$DSH_CONN_INDEX" >&2; exit 1; }
    fi
  done
done

if [ "$FOUND_CLIENT" -eq 0 ] || [ "$FOUND_INDEX" -eq 0 ]; then
  echo "[patch] ERROR: 未找到 dsh-client-connection（client.js=$FOUND_CLIENT index.js=$FOUND_INDEX）；roots: $ROOTS" >&2
  exit 1
fi

echo "[patch] DSH patches complete（client.js ×$FOUND_CLIENT，index.js ×$FOUND_INDEX）"
