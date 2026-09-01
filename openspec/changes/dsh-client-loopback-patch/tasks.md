# 实施清单：DSH Client Loopback 检查 Patch

## 任务列表

- [x] 创建 `scripts/patch-dsh-client.sh` 脚本
- [x] 设置脚本执行权限（`chmod +x`）
- [x] 修改 Dockerfile，添加 patch 脚本复制和执行
- [x] 验证 patch 脚本幂等性（重复执行不报错）
- [x] 推送到 Git

## 验证

- [ ] 容器启动日志包含 `[patch] Successfully patched DSH client.js loopback check`
- [ ] 重复启动容器，日志显示 `[patch] Already patched, skipping`
- [ ] 设置页面能正常加载模型提供方目录
- [ ] DSH 版本更新后 patch 自动重新执行
