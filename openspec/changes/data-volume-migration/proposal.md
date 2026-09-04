# 数据卷迁移与持久化策略统一

## Why

DSH Hub 生产环境在升级过程中发生了**用户数据丢失**问题。根因是 `docker-compose.yml` 在 `git pull` 升级时，数据卷配置从 **Docker 命名卷** 切换为 **bind mount**，导致旧数据与新容器断开连接。

### 根因分析

```
升级前：Docker 命名卷 dsh-hub-data
        → 数据在 /var/lib/docker/volumes/dsh-hub-data/_data/

升级时：git pull 拉取新 docker-compose.yml
        → volumes 改为 bind mount /opt/dsh-hub/dsh-hub/data

升级后：新容器挂载空目录
        → 旧命名卷数据不可见（但仍在 /var/lib/docker/volumes/ 中）
```

### 加剧因素

1. `/opt/dsh-hub` 本身是 git 仓库，`git pull` 可能覆盖目录内容
2. 所有数据在系统盘 `/dev/vda3` 上，没有独立数据盘隔离
3. 数据目录在代码仓库内，违反代码与数据分离原则

### 影响

- 用户已创建的所有实例工作空间数据丢失
- 已安装的插件需要重新安装
- 会话和配置需要重新设置
- 旧数据可能仍存在于命名卷中，有机会恢复

## What Changes

1. **统一数据持久化路径**：将数据目录从 `/opt/dsh-hub/dsh-hub/data` 迁移到 `/data/dsh-hub`
   - 独立于代码仓库，避免 `git pull` 影响
   - 为后续挂载独立数据盘预留路径

2. **修改 docker-compose.yml**：
   ```yaml
   volumes:
     - /data/dsh-hub:/data   # bind mount 到独立路径
   ```

3. **修改 deploy.sh**：
   ```bash
   DATA_DIR="/data/dsh-hub"  # 原来是 /opt/dsh-hub/dsh-hub/data
   ```

4. **添加数据恢复脚本**（可选）：从旧命名卷恢复数据
   ```bash
   docker run --rm \
     -v dsh-hub-data:/old-data \
     -v /data/dsh-hub:/new-data \
     alpine sh -c "cp -a /old-data/* /new-data/"
   ```

## Impact

- **修改文件**：
  - `dsh-hub/docker-compose.yml`（volumes 配置）
  - `dsh-hub/scripts/deploy.sh`（DATA_DIR 变量）

- **部署影响**：
  - 需要在服务器上创建 `/data/dsh-hub` 目录
  - 首次部署后需验证数据持久化
  - 如有旧命名卷数据，需手动迁移

- **不影响**：
  - 代码逻辑（`paths.ts`、`db.ts`）只读 `DSH_HUB_DATA` 环境变量
  - 容器内路径 `/data` 不变
  - 现有实例数据（如能恢复）无需修改

- **后续改进**（不在本次范围）：
  - 挂载独立云盘到 `/data/dsh-hub`
  - 升级脚本增加 volume 配置变更检测
  - `.gitignore` 排除 `data/` 目录
