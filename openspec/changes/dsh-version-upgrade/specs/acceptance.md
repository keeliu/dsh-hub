# 验收规范：升级 DSH 基线版本（方案 A）

## 场景 1：镜像内版本正确
**Given** 已按方案 A 重建镜像
**When** `docker run --rm --entrypoint dsh dsh-hub:latest --version`
**Then** 输出 `0.1.5-rc.2`（与 Dockerfile 两处 pin 一致）

## 场景 2：模板含全部预置插件
**Given** 镜像构建完成
**When** 检查 `/opt/dsh-home-template/profiles/web/package.json` 的 `dependencies`
**Then** 覆盖当前预置清单（`presets.ts::DEFAULT_PRESET_PLUGINS`）全部插件
**And** 缺任一即构建失败（构建期校验生效）

## 场景 3：客户端补丁动态定位成功
**Given** 新版本可能改变嵌套目录布局
**When** 容器启动执行 `patch-dsh-client.sh`
**Then** 脚本用 `require.resolve` 定位到 `@deepseek-ai/dsh-client-connection/lib/client.js`
**And** 输出 `Successfully patched`（**不是** `skipping patch`）
**And** 若定位失败则**显式报错退出**（不静默放过）

## 场景 4：新建实例默认用新版
**Given** 基线已升级
**When** 新建一个实例并启动 `dsh web`
**Then** 实例使用 `0.1.5-rc.2`
**And** 启动无模块/依赖解析报错

## 场景 5：实例插件齐全
**Given** 新建实例启动完成
**Then** `home/profiles/web/package.json` 含全部预置插件
**And** `home/profiles/web/node_modules/` 有对应包

## 场景 6：实例 UI 可用（补丁生效）
**Given** 新建实例运行中
**When** 打开该实例的 workspace/设置页
**Then** 正常打开（**无 403**）—— 证明 loopback 补丁对全局基线生效

## 场景 7：hub 本身正常
**Given** 升级后容器重启
**When** 访问 hub 登录/导航/实例管理
**Then** 一切正常；`healthz` 返回 ok

## 场景 8：回滚可用
**Given** 升级后发现问题
**When** 执行 `docker tag dsh-hub:pre-0.1.5 dsh-hub:latest && docker compose up -d --force-recreate`
**Then** 恢复旧基线 `0.1.0-rc.7` 与可用状态

## 场景 9：存量实例处置
**Given** 存在旧基线创建的实例
**When** 确认新实例验证通过后
**Then** 对存量实例删除重建（保留其 workspace 数据）
**And** 不因旧 profile 与新基线依赖闭包不匹配而产生隐蔽故障

## 场景 10：工作区/智能体页面不再报鉴权错误
**Given** 基线为 `0.1.5-rc.2`（该版本给 `dsh web` 增加了浏览器鉴权）
**And** hub 启动实例时注入了 `ONEPANEL_DSH_AUTH_PROXY=1`
**When** 用户打开智能体/工作区页面
**Then** 正常加载，**不出现** `dsh web authentication required; reopen the URL printed by dsh web.`
**And** 实例仍仅监听 `127.0.0.1`，所有入口仍经 hub 鉴权（会话 + 所有权 + 会员）

## 场景 11：Workspace 客户端 bundle 正常加载
**Given** 实例 index 用 `/plugins/??…` 加载客户端 bundle，并在内联 `__DSH_BOOT__` JSON 里携带同一 URL
**And** hub 的 `rewriteHtmlPaths` 对标签属性与内联 JSON 使用**同一前缀**
**When** 打开 workspace/智能体页面
**Then** 不再出现 `Failed to load plugins` / `client-modules: HTML did not preload …`
**And** 标签 URL 与 `__DSH_BOOT__` 里的 URL 一致（均为 `/workspace/plugins/…`），无重复前缀
