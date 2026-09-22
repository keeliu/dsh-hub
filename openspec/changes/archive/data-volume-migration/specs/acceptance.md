# 数据卷迁移验收规范

## 场景 1：数据目录路径正确

**Given** 部署脚本 `deploy.sh` 已更新
**When** 执行 `grep DATA_DIR deploy.sh`
**Then** 输出应包含 `DATA_DIR="/data/dsh-hub"`

## 场景 2：Docker Compose 卷配置正确

**Given** `docker-compose.yml` 已更新
**When** 执行 `grep -A2 "volumes:" docker-compose.yml`
**Then** 输出应包含 `- /data/dsh-hub:/data`

## 场景 3：数据目录独立于代码仓库

**Given** 代码仓库位于 `/opt/dsh-hub/dsh-hub/`
**When** 检查数据目录位置
**Then** 数据目录应为 `/data/dsh-hub`，不在 git 仓库内

## 场景 4：数据持久化验证

**Given** 容器已启动并写入测试数据
**When** 执行 `docker rm -f dsh-hub && docker compose up -d`
**Then** 重新启动后，测试数据应仍然存在

## 场景 5：旧命名卷数据恢复（如适用）

**Given** 旧命名卷 `dsh-hub-data` 存在
**When** 执行数据恢复命令
**Then** `/data/dsh-hub/` 应包含旧数据（users/、dshhub.db 等）

## 场景 6：目录权限正确

**Given** `/data/dsh-hub` 目录已创建
**When** 执行 `ls -la /data/`
**Then** `dsh-hub` 目录权限应为 `drwx------`（700），所有者为 root
