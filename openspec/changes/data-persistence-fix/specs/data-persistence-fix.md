# 数据持久化修复规范

## 术语

- **DSH_HUB_DATA**：DSH Hub 的根数据目录，包含数据库、用户实例数据
- **持久化存储**：部署平台提供的跨容器重建保留的存储卷

## 启动时数据目录检查

Given DSH Hub 容器启动

When 执行 `deploy_run.sh`

Then 按以下逻辑确定数据目录：
1. 尝试创建并写入 `/mnt/data/dsh-hub`
2. 如果成功 → `DSH_HUB_DATA=/mnt/data/dsh-hub`，正常启动
3. 如果失败 → 打印错误信息（包含可能的原因和解决建议），`exit 1` 拒绝启动

**禁止**回退到 `/tmp` 或任何非持久化路径。

## 错误信息规范

When 持久化存储不可用

Then 错误信息必须包含：
- 明确说明 `/mnt/data` 不可用
- 提示检查部署平台的持久化存储配置
- 提示如果是自建服务器，需要挂载卷到 `/mnt/data`

示例：
```
[deploy-run] 错误：持久化存储 /mnt/data 不可用或不可写
[deploy-run] 请检查部署平台的存储配置，确保 /mnt/data 已挂载持久化卷
[deploy-run] 如果是自建服务器，请使用 docker run -v /host/path:/mnt/data 启动
```

## Dockerfile 路径统一

Given Dockerfile 中声明了 `DSH_HUB_DATA` 环境变量

When 构建 Docker 镜像

Then `DSH_HUB_DATA` 的值必须与 `deploy_run.sh` 中使用的路径一致（`/mnt/data/dsh-hub`）

## 安全约束

- 数据目录权限保持 `700`（仅 owner 可读写），由 `paths.ts` 的 `mkdirSync(dir, { recursive: true, mode: 0o700 })` 保证
- 数据库文件权限保持 `600`，由 `db.ts` 的 `chmodSync(dbPath, 0o600)` 保证
- 本变更不修改这些权限逻辑
