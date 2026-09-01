#!/bin/sh
# DSH Client Loopback Patch
# 绕过 DSH 客户端的 loopback 检查，允许通过 dsh-hub 网关访问设置页面
# 安全性：dsh-hub 已实现完整的鉴权 + 所有权校验 + Host/Origin 重写

set -e

DSH_CLIENT_JS="/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-connection/lib/client.js"

if [ ! -f "$DSH_CLIENT_JS" ]; then
  echo "[patch] DSH client.js not found at $DSH_CLIENT_JS, skipping patch"
  exit 0
fi

# 检查是否已 patch
if grep -q "isLoopback: true" "$DSH_CLIENT_JS"; then
  echo "[patch] Already patched, skipping"
  exit 0
fi

# 应用 patch：isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname) → isLoopback: true
sed -i 's/isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname)/isLoopback: true/g' "$DSH_CLIENT_JS"

echo "[patch] Successfully patched DSH client.js loopback check"
