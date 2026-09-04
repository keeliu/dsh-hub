# 实施清单：DSH 实例页面整屏显示

## 阶段 1：代码修改

- [x] 1.1 修改 `dsh-hub/src/gateway.ts` 中 `injectDeploymentConfig` 函数的 CSS 注入
  - 位置：约第 529-533 行
  - 将 `body { margin-top: 60px !important; }` 替换为新的 CSS 样式
  - 新样式包含：
    - `html, body { height: 100%; overflow: hidden; margin: 0; padding: 0; }`
    - `body { margin-top: 60px !important; height: calc(100vh - 60px) !important; overflow-y: auto !important; }`

## 阶段 2：验证

- [x] 2.1 类型检查
  - 运行 `npx tsc -p . --noEmit` 确认无类型错误

- [ ] 2.2 手动验证（需要启动服务后执行）
  - 启动 DSH Hub 服务
  - 确保有运行中的 DSH 实例
  - 访问 `/workspace` 页面
  - 确认 DSH 页面在导航栏下方完整显示
  - 确认底部内容不被截断
  - 确认页面可以正常滚动
  - 确认无双重滚动条

- [ ] 2.3 回归测试
  - 访问 `/instances` 页面，确认正常
  - 访问 `/profile` 页面，确认正常
  - 访问 `/admin/instances` 页面，确认正常
  - 确认 Hub 层页面不受影响

## 阶段 3：归档

- [ ] 3.1 更新 `AGENTS.md`
  - 在"当前进度"中添加修复记录

- [ ] 3.2 提交代码
  - commit message: `fix(workspace): 修复 DSH 实例页面底部内容被截断`

- [ ] 3.3 归档变更
  - 将 `openspec/changes/fix-workspace-fullscreen/` 移至 `openspec/changes/archive/`
