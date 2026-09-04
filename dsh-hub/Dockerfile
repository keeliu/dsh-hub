FROM node:24-slim

# 装 pnpm（dsh plugin add 需要）
RUN npm i -g pnpm

# 装 dsh（数据面；pin 死版本，别用 latest）
RUN npm i -g @deepseek-ai/dsh@0.1.0-rc.7

# 预装默认插件到模板目录
ENV TEMPLATE_DSH_HOME=/opt/dsh-home-template
RUN mkdir -p $TEMPLATE_DSH_HOME \
    && echo "ignore-scripts=false" > $TEMPLATE_DSH_HOME/.npmrc \
    && export DSH_HOME=$TEMPLATE_DSH_HOME \
    && dsh plugin --profile web add dsh-market \
    && dsh plugin --profile web add dsh-better-sidebar \
    && dsh plugin --profile web add dsh-im \
    && dsh plugin --profile web add dsh-cost-meter \
    && dsh plugin --profile web add dsh-visualize \
    && echo "Plugins pre-installed successfully"

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
    DSH_BIN=/usr/local/bin/dsh \
    TEMPLATE_DSH_HOME=/opt/dsh-home-template

VOLUME ["/data"]
EXPOSE 3082

# 复制 patch 脚本
COPY scripts/patch-dsh-client.sh /usr/local/bin/patch-dsh-client.sh
RUN chmod +x /usr/local/bin/patch-dsh-client.sh

# Node.js 24 原生支持 TypeScript，直接运行源码（无需编译）
# 启动时先执行 patch，再启动 Hub 服务
CMD ["sh", "-c", "/usr/local/bin/patch-dsh-client.sh && node --disable-warning=ExperimentalWarning src/index.ts"]
