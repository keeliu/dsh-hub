FROM node:24-slim

# 装 dsh（数据面；pin 死版本，别用 latest）
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

# Node.js 24 原生支持 TypeScript，直接运行源码（无需编译）
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
