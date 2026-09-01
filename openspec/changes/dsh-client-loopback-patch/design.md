# 技术方案：DSH Client Loopback 检查 Patch

## 架构决策

### 决策 1：Patch 方式

**选择**：使用 `sed` 命令原地修改 `client.js`

**理由**：
- 简单直接，无需重新构建 DSH
- 容器启动时自动执行，用户无感知
- 易于验证和维护

### 决策 2：Patch 时机

**选择**：容器启动时（CMD 中）执行 patch，再启动 Hub 服务

**理由**：
- 确保每次容器启动都应用 patch
- DSH 版本更新后自动重新 patch
- 无需手动干预

## 关键代码

### patch-dsh-client.sh

```bash
#!/bin/sh
set -e

DSH_CLIENT_JS="/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-connection/lib/client.js"

if [ ! -f "$DSH_CLIENT_JS" ]; then
  echo "[patch] DSH client.js not found, skipping"
  exit 0
fi

# 检查是否已 patch
if grep -q "isLoopback: true" "$DSH_CLIENT_JS"; then
  echo "[patch] Already patched, skipping"
  exit 0
fi

# 应用 patch
sed -i 's/isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname)/isLoopback: true/g' "$DSH_CLIENT_JS"

echo "[patch] Successfully patched DSH client.js loopback check"
```

### Dockerfile CMD

```dockerfile
CMD ["sh", "-c", "/usr/local/bin/patch-dsh-client.sh && node --disable-warning=ExperimentalWarning src/index.ts"]
```

## 安全性分析

**原始 loopback 检查的目的**：防止 DNS rebinding 攻击

**为什么可以绕过**：
1. dsh-hub 网关实现了完整的鉴权（session cookie / Bearer token）
2. 实例所有权校验（`verifyInstanceOwnership`）
3. Host/Origin 头重写（防止 CORS 问题）
4. 用户无法直接访问 DSH 实例（监听在 127.0.0.1）

**风险**：低。安全性由 hub 层保障，loopback 检查在此场景下是冗余的。
