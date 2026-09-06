# DSH Hub 镜像。
# 构建上下文：【仓库根】目录（同时包含 dsh-hub/ 与 scripts/ 的那一层）。
#   直接构建：docker build -f dsh-hub/Dockerfile .          # 从仓库根
#   组合构建：docker compose up --build -d                   # dsh-hub/docker-compose.yml（context 指向 ..）
# 说明：所有 COPY 均为【仓库根相对路径】（dsh-hub/...），这样 1panel 等从仓库根构建也能找到
#       dsh-hub/scripts/patch-dsh-client.sh 等文件。

# 阶段 1：template-builder —— 构建期预装默认插件模板
FROM node:24-slim AS template-builder

# git 供依赖拉取（github: 源若保留需它；镜像内 /usr/bin/git 已实测存在）
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# 装 pnpm + dsh（数据面；pin 死版本，别用 latest）
RUN npm i -g pnpm @deepseek-ai/dsh@0.1.0-rc.7

# 预装默认插件到模板目录。
# 关键：不再用 `|| echo WARN` 静默吞失败——任一插件装失败即令构建失败（&& 短路），
# 避免产出一个"缺插件的不完整模板"。5 个插件均为 npm 源（已实测可解析，无需 git)。
# pnpm v10+/11 默认不执行依赖生命周期脚本；dsh-better-sidebar 的 node-pty 需 node-gyp 编译，
# 必须在 profile 的 pnpm-workspace.yaml 里 allowBuilds 批准（否则安装被忽略而失败）。
ENV DSH_HOME=/opt/dsh-home-template
RUN mkdir -p $DSH_HOME/profiles/web \
    && echo "ignore-scripts=false" > $DSH_HOME/.npmrc \
    && dsh plugin --profile web add dshmarket \
    && printf 'allowBuilds:\n  node-pty: true\n' >> $DSH_HOME/profiles/web/pnpm-workspace.yaml \
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
# 安装 git（解析 github: 协议的插件依赖需要）
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# 装 pnpm（dsh plugin add 需要）
RUN npm i -g pnpm

# 装 dsh（数据面；pin 死版本，别用 latest）
RUN npm i -g @deepseek-ai/dsh@0.1.0-rc.7

# 复制只读插件模板
COPY --from=template-builder /opt/dsh-home-template /opt/dsh-home-template
RUN chmod -R 755 /opt/dsh-home-template

WORKDIR /app
# 以下 COPY 均为仓库根相对路径
COPY dsh-hub/package.json dsh-hub/package-lock.json ./
RUN npm install
COPY dsh-hub/ ./

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

# 复制 patch 脚本（仓库根相对路径）
COPY dsh-hub/scripts/patch-dsh-client.sh /usr/local/bin/patch-dsh-client.sh
RUN chmod +x /usr/local/bin/patch-dsh-client.sh

# Node.js 24 原生支持 TypeScript，直接运行源码（无需编译）
# 启动时先执行 patch，再启动 Hub 服务
CMD ["sh", "-c", "/usr/local/bin/patch-dsh-client.sh && node --disable-warning=ExperimentalWarning src/index.ts"]
