# 数据持久化修复

## Why

DSH Hub 的数据目录（`DSH_HUB_DATA`）存储了所有用户实例数据（会话、配置、插件、SQLite 数据库）。当前部署脚本 `deploy_run.sh` 在持久化存储不可用时，**静默回退到 `/tmp`**。`/tmp` 在容器重建时会被清空，导致所有用户数据丢失。

生产环境中已出现此问题：每次服务器重启/容器重建后，用户在 DSH 实例中产生的会话数据、配置数据、插件全部丢失。

## What Changes

1. **去掉 `/tmp` 回退**：`deploy_run.sh` 中持久化存储不可用时，打印明确错误信息并 `exit 1`，拒绝启动
2. **统一数据目录路径**：Dockerfile 中 `DSH_HUB_DATA=/data` 与 deploy 脚本中 `/mnt/data/dsh-hub` 不一致，统一为 `/mnt/data/dsh-hub`

## Impact

- **修改文件**：`scripts/deploy_run.sh`（去掉 `/tmp` 分支）、`Dockerfile`（统一 `DSH_HUB_DATA` 路径）
- **部署影响**：如果生产环境 `/mnt/data` 确实不可用，服务将拒绝启动而非静默丢数据。需要先确认持久化存储配置正确
- **不影响**：代码逻辑（`paths.ts`、`db.ts`）不关心具体路径，只读 `DSH_HUB_DATA` 环境变量
