# 数据持久化修复实施清单

## Phase 1：部署脚本修复

- [ ] 1.1 `scripts/deploy_run.sh`：去掉 `/tmp` 回退分支，改为持久化存储不可用时打印错误并 `exit 1`
- [ ] 1.2 错误信息包含明确的排查指引（存储配置、卷挂载）

## Phase 2：Dockerfile 路径统一

- [ ] 2.1 `Dockerfile`：`DSH_HUB_DATA` 从 `/data` 改为 `/mnt/data/dsh-hub`
- [ ] 2.2 `Dockerfile`：`VOLUME` 从 `["/data"]` 改为 `["/mnt/data"]`

## Phase 3：部署前验证

- [ ] 3.1 在生产服务器上确认 `/mnt/data/dsh-hub/` 目录存在且有数据
- [ ] 3.2 确认部署平台的持久化存储已正确挂载到 `/mnt/data`
- [ ] 3.3 如果 `/mnt/data` 不可用，先配置持久化存储再部署

## Phase 4：部署后验证

- [ ] 4.1 重启容器后，检查 `/mnt/data/dsh-hub/` 下数据是否保留
- [ ] 4.2 检查 DSH 实例的 `home` 和 `workspace` 目录数据是否完整
- [ ] 4.3 验证用户会话、配置、插件在重启后不丢失
