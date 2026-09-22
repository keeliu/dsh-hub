# 技术方案：Docker 构建与环境变量配置修复

## 架构决策

### 决策 1：运行方式

**选择**：直接运行 TypeScript 源码（`node src/index.ts`）而非编译后的 JS

**理由**：
- Node.js 24 原生支持 TypeScript
- 项目设计为直接运行源码（`dev` 脚本：`node --disable-warning=ExperimentalWarning src/index.ts`）
- 避免构建步骤的复杂性和潜在问题

### 决策 2：环境变量配置

**选择**：`DSH_HUB_DOMAIN` 运行时指定，其他两个写入 Dockerfile 默认值

**理由**：
- `DSH_HUB_DOMAIN` 是环境相关的（不同部署环境域名不同）
- `DSH_HUB_TRUST_PROXY` 和 `DSH_HUB_COOKIE_SECURE` 是部署模式相关的（有反代 + HTTPS 就必须启用）

## 关键代码变更

### Dockerfile

```dockerfile
FROM node:24-slim

RUN npm i -g @deepseek-ai/dsh@0.1.0-rc.7

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .

ENV NODE_ENV=production \
    DSH_HUB_DATA=/data \
    DSH_HUB_HOST=0.0.0.0 \
    DSH_HUB_PORT=3082 \
    DSH_HUB_TRUST_PROXY=1 \
    DSH_HUB_COOKIE_SECURE=1 \
    DSH_BIN=/usr/local/bin/dsh

VOLUME ["/data"]
EXPOSE 3082

COPY scripts/patch-dsh-client.sh /usr/local/bin/patch-dsh-client.sh
RUN chmod +x /usr/local/bin/patch-dsh-client.sh

CMD ["sh", "-c", "/usr/local/bin/patch-dsh-client.sh && node --disable-warning=ExperimentalWarning src/index.ts"]
```

### .dockerignore

```
node_modules
dist
.git
*.md
docs/
spikes/
scripts/
assets/
.openspec
.coze
AGENTS.md
```

## 部署命令

```bash
docker run -d \
  --name dsh-hub \
  -p 3082:3082 \
  -v /opt/dsh-hub/data:/data \
  -e DSH_HUB_DOMAIN=hub.wuyajun.cn \
  -e DSH_HUB_TRUST_PROXY=1 \
  -e DSH_HUB_COOKIE_SECURE=1 \
  -e DSH_BIN=/usr/local/bin/dsh \
  dsh-hub:latest
```
