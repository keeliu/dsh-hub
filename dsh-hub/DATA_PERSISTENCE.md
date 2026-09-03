# DSH Hub 数据持久化指南

## 问题说明

DSH Hub 的所有数据（数据库、用户实例、插件配置等）都存储在 `DSH_HUB_DATA` 目录中：

```
<dataDir>/
── dshhub.db                    # 数据库（用户、实例、订单等）
└── users/
    └── <dir_name>/
        ── instances/
            └── <实例 ID>/
                ├── home/        # DSH 数据（插件、配置、会话等）
                ├── workspace/   # 工作目录
                └── logs/        # 日志
```

**如果容器重建时没有将 `/data` 挂载到宿主机的持久化存储，所有数据都会丢失！**

---

## 解决方案

### 方案 1：使用 Docker Compose（推荐）

`docker-compose.yml` 已配置好命名卷 `dsh-hub-data`：

```bash
# 启动服务
docker-compose up -d

# 查看数据卷位置
docker volume inspect dsh-hub_dsh-hub-data
```

数据会存储在 Docker 管理的命名卷中，容器重建时数据不会丢失。

### 方案 2：使用宿主机目录挂载

如果你想将数据存储到宿主机的特定目录（如 `/opt/dsh-hub-data`）：

```bash
docker run -d \
  -v /opt/dsh-hub-data:/data \
  -p 3082:3082 \
  --name dsh-hub \
  dsh-hub:latest
```

或者修改 `docker-compose.yml`：

```yaml
volumes:
  - /opt/dsh-hub-data:/data
```

### 方案 3：非 Docker 部署（直接运行）

如果直接在服务器上运行（不使用 Docker），数据默认存储在：

```
<项目目录>/data/
```

确保升级时不要删除这个目录！

---

## 升级时保留数据的正确流程

### Docker 部署

```bash
# 1. 停止当前容器（数据保留在卷中）
docker-compose down

# 2. 拉取最新代码
git pull

# 3. 重新构建并启动（数据卷自动挂载）
docker-compose up -d --build
```

**关键：** 使用 `docker-compose down` 而不是 `docker-compose rm -f`，前者会保留命名卷。

### 非 Docker 部署

```bash
# 1. 停止服务
pkill -f "node.*src/index.ts"

# 2. 备份数据（可选但推荐）
cp -r /opt/dsh-hub/dsh-hub/data /opt/dsh-hub/dsh-hub/data.backup.$(date +%Y%m%d)

# 3. 拉取最新代码
git pull

# 4. 安装依赖
cd dsh-hub && pnpm install

# 5. 重启服务
nohup node --disable-warning=ExperimentalWarning src/index.ts > /tmp/dsh-hub.log 2>&1 &
```

---

## 检查数据是否正确持久化

### Docker 部署

```bash
# 查看容器挂载的卷
docker inspect dsh-hub | grep -A 10 Mounts

# 查看数据卷内容
docker run --rm -v dsh-hub_dsh-hub-data:/data alpine ls -la /data

# 进入容器查看
docker exec -it dsh-hub ls -la /data
```

### 非 Docker 部署

```bash
# 检查数据目录
ls -la /opt/dsh-hub/dsh-hub/data

# 检查数据库
ls -la /opt/dsh-hub/dsh-hub/data/dshhub.db

# 检查实例数据
ls -la /opt/dsh-hub/dsh-hub/data/users/
```

---

## 常见问题

### Q1: 升级后数据丢失了怎么办？

**Docker 部署：**
```bash
# 检查是否有未挂载的卷
docker volume ls

# 如果有旧的数据卷，可以重新挂载
docker run -d -v <旧卷名>:/data -p 3082:3082 --name dsh-hub dsh-hub:latest
```

**非 Docker 部署：**
```bash
# 检查是否有备份
ls -la /opt/dsh-hub/dsh-hub/data.backup.*

# 恢复备份
cp -r /opt/dsh-hub/dsh-hub/data.backup.20260903 /opt/dsh-hub/dsh-hub/data
```

### Q2: 如何迁移数据到新的服务器？

```bash
# 1. 在旧服务器备份数据
docker run --rm -v dsh-hub_dsh-hub-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/dsh-hub-data.tar.gz /data

# 2. 将备份文件传输到新服务器
scp dsh-hub-data.tar.gz user@new-server:/path/to/backup/

# 3. 在新服务器恢复数据
docker-compose up -d  # 先启动容器创建卷
docker run --rm -v dsh-hub_dsh-hub-data:/data -v /path/to/backup:/backup alpine \
  tar xzf /backup/dsh-hub-data.tar.gz -C /
```

### Q3: 如何确认数据卷是否正确配置？

```bash
# 查看 docker-compose.yml 中的卷配置
cat docker-compose.yml | grep -A 5 volumes

# 应该看到类似：
# volumes:
#   - dsh-hub-data:/data
```

---

## 关键提醒

⚠️ **无论使用哪种部署方式，必须确保数据目录被持久化！**

- ✅ Docker 命名卷（`dsh-hub-data`）
- ✅ 宿主机目录挂载（`/opt/dsh-hub-data:/data`）
- ✅ 非 Docker 部署时保留 `<项目目录>/data` 目录
- ❌ 不要直接运行容器而不挂载 `/data`
- ❌ 不要在升级时删除数据目录
