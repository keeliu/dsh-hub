# 变更提案：修复 dsh 插件安装命令

## Why

1. **Docker 构建失败**：`dsh install` 不是合法命令。新版 `@deepseek-ai/dsh@0.1.0-rc.7` 的插件管理命令已改为 `dsh plugin --profile <name> add <package>`，旧写法 `dsh install <package>` 会直接报错退出
2. **运行时插件安装同样受影响**：`src/instances.ts`、`src/supervisor/spawn.ts` 中的 `dsh install` 调用在新版 dsh 下也会失败，导致新实例无法安装默认插件

## What Changes

1. Dockerfile 中预装插件的命令从 `dsh install <pkg>` 改为 `dsh plugin --profile web add <pkg>`，并注入 `DSH_HOME` 指向模板目录
2. `src/instances.ts` 中运行时插件安装命令同步修正
3. `src/supervisor/spawn.ts` 中运行时插件安装命令同步修正
4. `scripts/install-default-plugins.sh` 运维脚本同步修正

## Impact

- **受影响模块**：`Dockerfile`、`src/instances.ts`、`src/supervisor/spawn.ts`、`scripts/install-default-plugins.sh`
- **用户可见**：Docker 镜像构建成功；新实例创建时插件能正常安装
- **向后兼容**：是，仅修改命令格式，不影响数据结构和业务逻辑
