# 阶段 1：template-builder —— 构建期预装默认插件模板
FROM node:24-slim AS template-builder

# git 供依赖拉取（github: 源若保留需它；镜像内 /usr/bin/git 已实测存在）
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# 装 pnpm + dsh（数据面；pin 死版本，别用 latest）
RUN npm i -g pnpm @deepseek-ai/dsh@0.1.0-rc.7

# 预装默认插件到模板目录。
# 关键：不再用 `|| echo WARN` 静默吞失败——任一插件装失败即令构建失败（&& 短路），
# 避免产出一个"缺插件的不完整模板"。5 个插件均为 npm 源（已实测可解析，无需 git)。
ENV DSH_HOME=/opt/dsh-home-template
RUN mkdir -p $DSH_HOME/profiles/web \
    && echo "ignore-scripts=false" > $DSH_HOME/.npmrc \
    && dsh plugin --profile web add dshmarket \
    && dsh plugin --profile web add dsh-better-sidebar \
    && dsh plugin --profile web add -w @xmanrui/dsh-im \
    && dsh plugin --profile web add dsh-cost-meter \
    && dsh plugin --profile web add dsh-visualize \
    && rm -f $DSH_HOME/.credentials.yaml \
    && rm -rf $DSH_HOME/sessions $DSH_HOME/workspace \
    && echo "Plugin template build completed"

# 构建期完整性校验：确认模板 dependencies 覆盖全部默认插件，否则让构建失败。
RUN node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('/opt/dsh-home-template/profiles/web/package.json','utf8'));const need=['dshmarket','dsh-better-sidebar','@xmanrui/dsh-im','dsh-cost-meter','dsh-visualize'];const miss=need.filter(n=>!p.dependencies?.[n]&&!p.devDependencies?.[n]);if(miss.length){console.error('[template] missing plugins:',miss);process.exit(1);}console.log('[template] all',need.length,'plugins present');"

# 阶段 2：最终镜像
FROM node:24-slim

# 装 pnpm（dsh plugin add 需要）
RUN npm i -g pnpm

# 装 dsh（数据面；pin 死版本，别用 latest）
RUN npm i -g @deepseek-ai/dsh@0.1.0-rc.7

# 复制只读插件模板
COPY --from=template-builder /opt/dsh-home-template /opt/dsh-home-template
RUN chmod -R 755 /opt/dsh-home-template

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
