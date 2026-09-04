# 实施清单：修复 dsh 插件安装命令

## 任务列表

- [x] Dockerfile：预创建 `$TEMPLATE_DSH_HOME/profiles/web` 目录
- [x] Dockerfile：`dsh install <pkg>` → `DSH_HOME=$TEMPLATE_DSH_HOME dsh plugin --profile web add <pkg>`（5 个插件）
- [x] `src/instances.ts`：`dsh install ${plugin}` → `dsh plugin --profile web add ${plugin}`
- [x] `src/supervisor/spawn.ts`：同上 + 同步插件列表 + dsh-im `-w` 处理
- [x] `scripts/install-default-plugins.sh`：同上
- [x] 类型检查通过（`tsc -p . --noEmit`）

## 验证

- [ ] `docker build` 成功（插件预装步骤无报错）
- [ ] 容器启动后 `/opt/dsh-home-template/profiles/web/node_modules/` 包含 5 个插件
- [ ] 创建新实例时插件安装日志无报错
