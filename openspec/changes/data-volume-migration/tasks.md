# 数据卷迁移实施清单

## 阶段 1：配置修改

- [ ] 1.1 修改 `dsh-hub/docker-compose.yml`
  - 将 volumes 从 `- /opt/dsh-hub/dsh-hub/data:/data` 改为 `- /data/dsh-hub:/data`

- [ ] 1.2 修改 `dsh-hub/scripts/deploy.sh`
  - 将 `DATA_DIR="/opt/dsh-hub/dsh-hub/data"` 改为 `DATA_DIR="/data/dsh-hub"`

## 阶段 2：服务器操作

- [ ] 2.1 创建数据目录
  ```bash
  sudo mkdir -p /data/dsh-hub
  sudo chmod 700 /data/dsh-hub
  ```

- [ ] 2.2 检查旧命名卷是否存在
  ```bash
  sudo docker volume ls | grep dsh-hub-data
  ```

- [ ] 2.3 如旧卷存在，恢复数据
  ```bash
  sudo docker run --rm \
    -v dsh-hub-data:/old-data \
    -v /data/dsh-hub:/new-data \
    alpine sh -c "cp -a /old-data/* /new-data/"
  ```

- [ ] 2.4 验证数据恢复
  ```bash
  sudo ls -la /data/dsh-hub/
  # 应包含：dshhub.db、users/ 等
  ```

## 阶段 3：部署验证

- [ ] 3.1 重新部署
  ```bash
  cd /opt/dsh-hub/dsh-hub
  ./deploy.sh --rebuild
  ```

- [ ] 3.2 检查容器状态
  ```bash
  sudo docker ps
  # 应显示 dsh-hub 容器运行中
  ```

- [ ] 3.3 检查健康状态
  ```bash
  curl http://localhost:3082/healthz
  # 应返回 ok
  ```

- [ ] 3.4 验证数据持久化
  ```bash
  sudo ls -la /data/dsh-hub/
  # 应包含：dshhub.db、users/ 等
  ```

- [ ] 3.5 访问服务验证
  ```bash
  # 浏览器访问 https://hub.wuyajun.cn
  # 登录并检查实例数据是否完整
  ```

## 阶段 4：清理（可选）

- [ ] 4.1 确认新配置稳定后，删除旧命名卷
  ```bash
  sudo docker volume rm dsh-hub-data
  ```

- [ ] 4.2 清理旧数据目录（如不再需要）
  ```bash
  sudo rm -rf /opt/dsh-hub/dsh-hub/data
  ```

## 验收标准

- [ ] 数据目录位于 `/data/dsh-hub`（不在 git 仓库内）
- [ ] 容器重启后数据不丢失
- [ ] 用户实例数据完整（users/ 目录存在）
- [ ] 数据库文件完整（dshhub.db 存在）
- [ ] 服务健康检查通过
