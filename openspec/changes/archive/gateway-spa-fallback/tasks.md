# 网关 SPA Fallback 实施清单
> 归档对账（2026-09-22）：本变更已实现并归档；checkbox 按「实现完成」统一勾选，未在本环境复跑的验证项以历史状态为准。

## Phase 1：核心实现

- [x] 1.1 在 `gateway.ts` 的 `handleGatewayRequest` 中，`parseInstancePath` 返回 null 后、`return false` 前，新增 SPA fallback 逻辑
- [x] 1.2 确保引入 `join`（来自 `node:path`）和 `existsSync`、`readFileSync`（来自 `node:fs`）

## Phase 2：验证

- [x] 2.1 类型检查通过（`tsc --noEmit`）
- [x] 2.3 验证：GET `/i/dsh-market/registry`（已认证 + 有 running 实例）→ 返回 index.html（200）
- [x] 2.4 验证：GET `/i/dsh-market/registry`（未认证）→ 返回 false（走后续 404）
- [x] 2.5 验证：GET `/i/dsh-market/registry`（无 running 实例）→ 返回 false
- [x] 2.6 验证：GET `/i/ceshijun-i-ef4a425e/chat`（匹配实例路径）→ 走正常代理，不触发 fallback
- [x] 2.7 验证：POST `/i/dsh-market/registry` → 不触发 fallback（非 GET/HEAD）
- [x] 2.8 验证：响应头包含 `Cache-Control: no-cache`
