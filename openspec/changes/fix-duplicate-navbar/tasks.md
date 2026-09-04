# 实施清单：修复实例管理页面导航栏重复

## 阶段 1：代码修复

- [x] 1.1 修改 `dsh-hub/src/pages.ts` 第 413 行
  - 移除多余的 `layout` 包裹
  - 改为直接调用 `renderInstancesPage`

## 阶段 2：验证

- [x] 2.1 类型检查
  - 运行 `npx tsc -p . --noEmit` 确认无类型错误

- [ ] 2.2 手动验证（需要切换到 Agent 模式后执行）
  - 启动服务
  - 访问 `/instances` 页面
  - 确认只显示一个导航栏
  - 检查页面内容正常

- [ ] 2.3 回归测试
  - 访问 `/instances/new` 页面，确认正常
  - 访问 `/instances/:id` 页面，确认正常
  - 访问 `/profile` 页面，确认正常
  - 访问 `/admin/instances` 页面，确认正常

## 阶段 3：归档

- [ ] 3.1 更新 `AGENTS.md`
  - 在"当前进度"中添加修复记录

- [ ] 3.2 提交代码
  - commit message: `fix(ui): 修复实例管理页面导航栏重复渲染`

- [ ] 3.3 归档变更
  - 将 `openspec/changes/fix-duplicate-navbar/` 移至 `openspec/changes/archive/`
