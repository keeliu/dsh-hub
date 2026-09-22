# 数据卷迁移技术方案

## 架构决策

### 决策 1：数据目录路径选择

**选择**：`/data/dsh-hub`

**理由**：
- 独立于代码仓库（`/opt/dsh-hub/dsh-hub/`）
- 路径简短，易于记忆和操作
- 为后续挂载独立云盘预留（可直接挂载到 `/data`）
- 符合 Linux FHS 标准（`/data` 用于应用数据）

**备选方案**：
- `/opt/dsh-hub-data`：仍在 `/opt` 下，不够独立
- `/var/lib/dsh-hub`：路径较长，操作不便
- `/mnt/data/dsh-hub`：`/mnt` 通常用于临时挂载

### 决策 2：卷类型选择

**选择**：bind mount（而非 Docker 命名卷）

**理由**：
- 数据路径可见，便于直接访问和备份
- 便于设置独立数据盘
- 便于数据恢复和迁移
- 生产环境更常用，运维友好

**备选方案**：
- Docker 命名卷：数据隐藏在 `/var/lib/docker/` 下，不便于直接访问

### 决策 3：代码与数据分离

**原则**：git 仓库中不包含运行时数据

**实施**：
- 数据目录 `/data/dsh-hub` 在仓库外
- `.gitignore` 应排除 `data/` 目录（如有）
- 升级脚本不得修改数据目录内容

## 实施步骤

### Step 1：创建数据目录

```bash
sudo mkdir -p /data/dsh-hub
sudo chmod 700 /data/dsh-hub
```

### Step 2：修改 docker-compose.yml

```yaml
services:
  dsh-hub:
    # ... 其他配置 ...
    volumes:
      - /data/dsh-hub:/data   # bind mount 到独立路径
```

### Step 3：修改 deploy.sh

```bash
DATA_DIR="/data/dsh-hub"  # 原来是 /opt/dsh-hub/dsh-hub/data
```

### Step 4：迁移旧数据（如需要）

```bash
# 检查旧命名卷
sudo docker volume ls | grep dsh-hub-data

# 如果存在，恢复数据
sudo docker run --rm \
  -v dsh-hub-data:/old-data \
  -v /data/dsh-hub:/new-data \
  alpine sh -c "cp -a /old-data/* /new-data/"

# 验证数据
sudo ls -la /data/dsh-hub/
```

### Step 5：重新部署

```bash
cd /opt/dsh-hub/dsh-hub
./deploy.sh --rebuild
```

### Step 6：验证

```bash
# 检查容器状态
sudo docker ps

# 检查数据持久化
sudo ls -la /data/dsh-hub/

# 访问服务
curl http://localhost:3082/healthz
```

## 回滚方案

如果新配置有问题，可以回滚：

```bash
# 1. 修改回旧配置
DATA_DIR="/opt/dsh-hub/dsh-hub/data"

# 2. 重新部署
./deploy.sh --rebuild

# 3. 验证服务正常
curl http://localhost:3082/healthz
```

## 后续改进

### 改进 1：挂载独立数据盘

```bash
# 创建云盘（阿里云控制台）
# 格式化
sudo mkfs.ext4 /dev/vdb

# 挂载
sudo mount /dev/vdb /data

# 写入 fstab 持久化
echo '/dev/vdb /data ext4 defaults 0 0' | sudo tee -a /etc/fstab
```

### 改进 2：升级脚本保护

在 `upgrade.sh` 中添加：

```bash
# 检测 volume 配置变更
if ! grep -q "/data/dsh-hub:/data" docker-compose.yml; then
  echo "️  警告：volume 配置可能已变更，请检查 docker-compose.yml"
  read -p "是否继续？(y/N) " confirm
  [[ "$confirm" != "y" ]] && exit 1
fi
```

### 改进 3：定期备份

```bash
# 添加到 crontab
0 2 * * * cd /data && tar -czf dsh-hub-backup-$(date +\%Y\%m\%d).tar.gz dsh-hub/
```
