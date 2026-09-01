# 变更提案：DSH Client Loopback 检查 Patch

## Why

DSH 客户端有 loopback 检查（`isLoopbackHostname(pageLocation.hostname)`），阻止非 localhost 域名访问设置页面。用户通过 `hub.wuyajun.cn` 访问时，设置页面报错 "settings are unavailable in this browser"。

## What Changes

1. 创建 `scripts/patch-dsh-client.sh` 脚本，patch 容器内的 `client.js`
2. 修改 Dockerfile，在启动时自动执行 patch 脚本
3. 将 `isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname)` 改为 `isLoopback: true`

## Impact

- **受影响文件**：容器内 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-connection/lib/client.js`
- **用户可见**：设置页面能正常加载模型提供方目录
- **安全性**：dsh-hub 网关已实现完整鉴权 + 所有权校验 + Host/Origin 重写，安全性由 hub 层保障
- **持久性**：容器重建或 DSH 版本更新后需重新 patch（脚本自动执行）
