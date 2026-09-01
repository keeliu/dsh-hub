# 变更汇总：DSH Hub 生产环境修复

## 变更列表

| 变更 | 状态 | 说明 |
|---|---|---|
| [websocket-event-proxy](./websocket-event-proxy/) | ✅ 已完成 | WebSocket 事件通道代理 |
| [docker-build-fix](./docker-build-fix/) | ✅ 已完成 | Docker 构建与环境变量配置修复 |
| [dsh-client-loopback-patch](./dsh-client-loopback-patch/) | ✅ 已完成 | DSH Client Loopback 检查 Patch |

## 问题根因

**现象**：用户在设置 → 模型页面看到 "加载提供方目录失败：settings are unavailable in this browser"

**根因链**：
```
1. Docker 构建错误（noEmit:true）→ dist/index.js 缺失 → 容器崩溃
2. 环境变量缺失 → 实例链接域名错误（dshhub.local）
3. DSH Client loopback 检查 → 非 localhost 域名无法访问设置页面
4. WebSocket 事件通道未代理 → 前端无法接收实时数据
```

## 解决方案

1. **修复 Docker 构建**：直接运行 TypeScript 源码，添加必要的环境变量
2. **Patch DSH Client**：绕过 loopback 检查，允许通过 hub 域名访问设置
3. **代理 WebSocket 事件通道**：将 `/api/events.mux` 和 `/api/events.host` 代理到用户实例

## 部署命令

```bash
# 拉取代码
cd /opt/dsh-hub && git pull

# 重建镜像
docker build -t dsh-hub:latest ./dsh-hub

# 停止旧容器
docker stop dsh-hub && docker rm dsh-hub

# 启动新容器
docker run -d \
  --name dsh-hub \
  --restart unless-stopped \
  -p 3082:3082 \
  -v /opt/dsh-hub/data:/data \
  -e DSH_HUB_DOMAIN=hub.wuyajun.cn \
  -e DSH_HUB_TRUST_PROXY=1 \
  -e DSH_HUB_COOKIE_SECURE=1 \
  -e DSH_BIN=/usr/local/bin/dsh \
  dsh-hub:latest

# 修复数据库中旧实例的 trusted_host
docker exec dsh-hub sqlite3 /data/dsh-hub/dshhub.db \
  "UPDATE instances SET trusted_host = 'hub.wuyajun.cn' WHERE trusted_host = 'dshhub.local';"

# 验证
docker logs dsh-hub | grep "\[patch\]"
curl http://localhost:3082/healthz
```

## 验证步骤

1. 刷新浏览器页面（清除旧缓存）
2. 在 Hub 页面重新启动实例（容器重启后实例变为 stopped 是预期行为）
3. 进入设置 → 模型页面，验证能正常加载提供方目录
