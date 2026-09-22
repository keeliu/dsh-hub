#!/bin/sh
# DSH Client Loopback Patch
# 绕过 DSH 客户端的 loopback 检查，允许通过 dsh-hub 网关访问设置页面
# 安全性：dsh-hub 已实现完整的鉴权 + 所有权校验 + Host/Origin 重写
#
# 版本健壮性（针对 @deepseek-ai/dsh 升级）：不再硬编码内部嵌套依赖路径
# （.../dsh/node_modules/@deepseek-ai/dsh-client-connection/... 跨版本极易变化）；
# 改用 require.resolve 动态定位。定位不到、或补丁目标不存在时，显式报错退出，
# 绝不静默跳过 —— 避免"补丁静默失效 → 实例设置页 403"。

set -e

DSH_GLOBAL_DIR="/usr/local/lib/node_modules/@deepseek-ai/dsh"

# —— 动态定位客户端 client.js（版本升级后目录布局变化也能命中）——
DSH_CLIENT_JS="$(node -e "
  try {
    console.log(require.resolve('@deepseek-ai/dsh-client-connection/lib/client.js', { paths: ['$DSH_GLOBAL_DIR'] }));
  } catch (e) { process.exit(1); }
" 2>/dev/null || true)"

if [ -z "$DSH_CLIENT_JS" ] || [ ! -f "$DSH_CLIENT_JS" ]; then
  echo "[patch] ERROR: 未定位到 DSH client.js（@deepseek-ai/dsh 目录布局可能已变）。" >&2
  echo "[patch]        尝试: require.resolve('@deepseek-ai/dsh-client-connection/lib/client.js', paths=['$DSH_GLOBAL_DIR'])" >&2
  echo "[patch]        不做静默跳过；请核对新版布局并更新本脚本。" >&2
  exit 1
fi

# 已 patch 过则跳过
if grep -q "isLoopback: true" "$DSH_CLIENT_JS"; then
  echo "[patch] Already patched, skipping ($DSH_CLIENT_JS)"
  exit 0
fi

# —— 应用 patch ——
TARGET='isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname)'
if ! grep -qF "$TARGET" "$DSH_CLIENT_JS"; then
  echo "[patch] ERROR: 未在 $DSH_CLIENT_JS 找到预期补丁目标（客户端源码可能已变）。" >&2
  echo "[patch]        target: $TARGET" >&2
  echo "[patch]        不做静默跳过；请核对新版 loopback 判定写法并更新本脚本。" >&2
  exit 1
fi

sed -i "s/$TARGET/isLoopback: true/g" "$DSH_CLIENT_JS"

# —— 复核确实生效 ——
if grep -q "isLoopback: true" "$DSH_CLIENT_JS"; then
  echo "[patch] Successfully patched DSH client.js loopback check ($DSH_CLIENT_JS)"
else
  echo "[patch] ERROR: sed 执行后仍未检测到 isLoopback: true" >&2
  exit 1
fi
