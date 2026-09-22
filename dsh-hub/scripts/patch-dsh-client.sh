#!/bin/sh
# DSH Client Loopback Patch
# 绕过 DSH 客户端的 loopback 检查，允许通过 dsh-hub 网关访问设置页面
set -e
DSH_GLOBAL_DIR="/usr/local/lib/node_modules/@deepseek-ai/dsh"

# —— 动态定位客户端 client.js ——
DSH_CLIENT_JS="$(find "$DSH_GLOBAL_DIR" -path "*/dsh-client-connection/lib/client.js" -type f 2>/dev/null | head -1)"

if [ -z "$DSH_CLIENT_JS" ] || [ ! -f "$DSH_CLIENT_JS" ]; then
  echo "[patch] ERROR: 未定位到 DSH client.js" >&2
  exit 1
fi

echo "[patch] Found client.js at: $DSH_CLIENT_JS"

# 已 patch 过则跳过
if grep -q "isLoopback: true" "$DSH_CLIENT_JS"; then
  echo "[patch] Already patched, skipping"
  exit 0
fi

# —— 使用 node 进行精确替换（避免 sed 特殊字符问题）——
node -e "
const fs = require('fs');
const file = process.argv[1];
let src = fs.readFileSync(file, 'utf8');

// 新版写法
const newPattern = 'isLoopback: transport?.ownsHost === true || pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname)';
// 旧版写法
const oldPattern = 'isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname)';

let patched = false;
if (src.includes(newPattern)) {
  src = src.split(newPattern).join('isLoopback: true');
  patched = true;
  console.log('[patch] Matched new-style isLoopback pattern');
} else if (src.includes(oldPattern)) {
  src = src.split(oldPattern).join('isLoopback: true');
  patched = true;
  console.log('[patch] Matched old-style isLoopback pattern');
}

if (!patched) {
  // 输出实际的 isLoopback 行供调试
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('isLoopback:') && !l.includes('isLoopbackHostname')) {
      console.error('[patch] Actual isLoopback line ' + (i+1) + ': ' + l.trim());
    }
  });
  console.error('[patch] ERROR: 未找到预期补丁目标');
  process.exit(1);
}

fs.writeFileSync(file, src);
console.log('[patch] Successfully patched DSH client.js loopback check');
" "$DSH_CLIENT_JS"

# —— 复核 ——
if grep -q "isLoopback: true" "$DSH_CLIENT_JS"; then
  echo "[patch] Verified: isLoopback: true present"
else
  echo "[patch] ERROR: 验证失败" >&2
  exit 1
fi
