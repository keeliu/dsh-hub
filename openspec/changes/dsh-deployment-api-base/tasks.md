# DSH Deployment API Base 动态化实施清单

## Phase 1：核心改动

- [ ] 1.1 修改 `gateway.ts` 中 `/dsh-deployment.js` 处理逻辑：从 Referer 提取实例路径，动态生成 `apiBase` 和 `wsBase`
- [ ] 1.2 添加 `Cache-Control: no-cache, no-store` 响应头
- [ ] 1.3 处理无 Referer 的 fallback 情况（空 `apiBase`）

## Phase 2：验证

- [ ] 2.1 类型检查通过（`tsc --noEmit`）
- [ ] 2.2 验证：有 Referer 时返回正确的实例前缀
- [ ] 2.3 验证：无 Referer 时返回空 `apiBase`
- [ ] 2.4 验证：Referer 不匹配实例路径格式时返回空 `apiBase`
- [ ] 2.5 验证：响应头包含 `Cache-Control: no-cache, no-store`
- [ ] 2.6 冒烟测试：插件 API 请求能正确代理到 DSH 实例
