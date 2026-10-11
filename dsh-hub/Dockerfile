# DSH Hub 镜像。
# 构建上下文：【仓库根】目录（同时包含 dsh-hub/ 与 scripts/ 的那一层）。
#   直接构建：docker build -f dsh-hub/Dockerfile .          # 从仓库根
#   组合构建：docker compose up --build -d                   # dsh-hub/docker-compose.yml（context 指向 ..）
# 说明：所有 COPY 均为【仓库根相对路径】（dsh-hub/...），这样 1panel 等从仓库根构建也能找到
#       dsh-hub/scripts/patch-dsh-client.sh 等文件。

# 阶段 1：template-builder —— 构建期预装默认插件模板
FROM node:24-slim AS template-builder

# git 供依赖拉取；python3 + build-essential（make/g++）供 node-gyp 编译 node-pty 等原生模块
RUN apt-get update && apt-get install -y git python3 build-essential && rm -rf /var/lib/apt/lists/*

# 装 pnpm + dsh（数据面；pin 死版本，别用 latest）
# 基线版本 = 0.2.0-rc.2（当前 npm `latest`）。**必须与阶段 2 那一处完全相同**：
# 模板是本阶段用这个 dsh 装出来的，运行时换成别的版本会报
# `plugin tree failed to load: @deepseek-ai/dsh-sandbox-local`。
RUN npm i -g pnpm @deepseek-ai/dsh@0.2.0-rc.2

# 预装默认插件到模板目录。
# 关键：不再用 `|| echo WARN` 静默吞失败——任一插件装失败即令构建失败（&& 短路），
# 避免产出一个"缺插件的不完整模板"。9 个插件均为 npm 源（已实测可解析，无需 git)。
# 第 5 个用 @nagi-ovo/dsh-visualize 而**不是**官方 dsh-visualize：后者 0.2.1 的
# peerDependencies 只写到 `^0.1.0-rc.6`，在 dsh 0.2.0-rc.2 上会被 dsh 直接拒绝
# （实测：`installation rejected: Plugin dsh-visualize@0.2.1 is incompatible with dsh 0.2.0-rc.2`），
# 整条 `&&` 链失败、产不出镜像；@nagi-ovo/dsh-visualize 声明
# `^0.1.0-rc.6 || ^0.2.0-rc.1`，在 0.2.0-rc.2 上实测可装（与 presets.ts 默认清单一致）。
# 第 6~9 个（@michengai/* 与 dsh-context，2026-10 扩容）：同样在构建期安装，peerDependencies
# 明确覆盖 0.2.0-rc.2（dsh-context 用 `>=0.1.7-rc.2` 范围），实测可装、无需 pnpm 批准 build。
# 清单只在 presets.ts 维护；下面的构建期校验会解析它并与模板 dependencies 比对，漏装即失败。
# pnpm v10+/11 默认不执行依赖生命周期脚本；dsh-better-sidebar 的 node-pty 需 node-gyp 编译，
# 必须在 profile 的 pnpm-workspace.yaml 里 allowBuilds 批准（否则安装被忽略而失败）。
ENV DSH_HOME=/opt/dsh-home-template
COPY dsh-hub/src/presets.ts /tmp/presets.ts
RUN mkdir -p $DSH_HOME/profiles/web \
    && echo "ignore-scripts=false" > $DSH_HOME/.npmrc \
    && dsh plugin --profile web add dshmarket \
    && printf 'allowBuilds:\n  node-pty: true\n' >> $DSH_HOME/profiles/web/pnpm-workspace.yaml \
    && dsh plugin --profile web add dsh-better-sidebar \
    && dsh plugin --profile web add -w @xmanrui/dsh-im \
    && dsh plugin --profile web add dsh-cost-meter \
    && dsh plugin --profile web add @nagi-ovo/dsh-visualize \
    && dsh plugin --profile web add @michengai/dsh-automation \
    && dsh plugin --profile web add @michengai/dsh-skills-manager \
    && dsh plugin --profile web add dsh-context \
    && dsh plugin --profile web add @michengai/dsh-archive-manager \
    && rm -f $DSH_HOME/.credentials.yaml \
    && rm -rf $DSH_HOME/sessions $DSH_HOME/workspace \
    && echo "Plugin template build completed"

# 构建期完整性校验（任一不满足即构建失败）：
#   ① 模板 dependencies 覆盖 **presets.ts 里 enabled 的全部预置插件**（清单以代码为单一真相源，
#      不再在 Dockerfile 里重复维护一份名单——加插件只需改 presets.ts + 上面的安装链）；
#   ② 模板 profile 的 dsh.profile.bundles 声明了核心 bundle（dsh 从**自己的安装目录**解析
#      base/web-app，profile 的 node_modules 里本来就没有它们，所以要看 bundles 声明）；
#   ③ 这些核心 bundle 在全局 dsh 安装里真实存在，且版本与 dsh 包一致。
#   ③ 是关键不变量：运行时若用另一个版本的 dsh 启动该模板（例如实例指定了非内置版本），
#   bundle 与 dsh 版本错配会报 `plugin tree failed to load: @deepseek-ai/dsh-sandbox-local`。
RUN node -e "const fs=require('node:fs');const cp=require('node:child_process');const src=fs.readFileSync('/tmp/presets.ts','utf8');const need=[...src.matchAll(/{\s*spec:\s*'([^']+)'\s*,\s*enabled:\s*(true|false)/g)].filter(m=>m[2]==='true').map(m=>m[1]);const p=JSON.parse(fs.readFileSync('/opt/dsh-home-template/profiles/web/package.json','utf8'));const miss=need.filter(n=>!p.dependencies?.[n]&&!p.devDependencies?.[n]);const core=['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app'];const bundles=(p.dsh&&p.dsh.profile&&p.dsh.profile.bundles)||[];const missBundle=core.filter(n=>!bundles.includes(n));const dshRoot=cp.execSync('npm root -g').toString().trim()+'/@deepseek-ai/dsh';const dshVer=JSON.parse(fs.readFileSync(dshRoot+'/package.json','utf8')).version;const badVer=core.filter(n=>{try{return JSON.parse(fs.readFileSync(dshRoot+'/node_modules/'+n+'/package.json','utf8')).version!==dshVer;}catch{return true;}});if(need.length===0||miss.length||missBundle.length||badVer.length){console.error('[template] 完整性校验失败: presets.ts 解析到',need.length,'个插件 | 模板缺',miss,'| 缺 bundle 声明',missBundle,'| bundle 缺失或与 dsh 版本不一致',badVer,'| dsh',dshVer);process.exit(1);}console.log('[template] OK: 预置插件 '+need.length+' 个全部在模板 + 核心 bundle 声明 + 版本一致 (dsh '+dshVer+')');"

# 阶段 2：最终镜像
FROM node:24-slim
# 安装 git（解析 github: 协议的插件依赖需要）+ python3/build-essential（运行时回退安装原生模块需要）
RUN apt-get update && apt-get install -y git python3 build-essential && rm -rf /var/lib/apt/lists/*

# 装 pnpm（dsh plugin add 需要）
RUN npm i -g pnpm

# 装 dsh（数据面；pin 死版本，别用 latest）
RUN npm i -g @deepseek-ai/dsh@0.2.0-rc.2

# 复制只读插件模板
COPY --from=template-builder /opt/dsh-home-template /opt/dsh-home-template
RUN chmod -R 755 /opt/dsh-home-template

WORKDIR /app
# 以下 COPY 均为仓库根相对路径。
# 只复制运行时需要的源码与配置，不用 `COPY dsh-hub/ ./`（那会把构建机 dsh-hub/node_modules
# 一并带入 /app，覆盖 npm install 结果导致冲突）。
COPY dsh-hub/package.json dsh-hub/package-lock.json ./
RUN npm install
COPY dsh-hub/src ./src
COPY dsh-hub/tsconfig.json ./tsconfig.json

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

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3082/healthz',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
