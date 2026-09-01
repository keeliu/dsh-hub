# 功能规范：Docker 构建与环境变量配置

## 场景 1：容器启动

**Given** Docker 镜像已构建  
**When** 启动容器  
**Then** 容器应成功启动（Exit Code 0）  
**And** `node src/index.ts` 应被执行为入口命令

## 场景 2：环境变量默认值

**Given** 容器启动时未指定 `DSH_HUB_TRUST_PROXY`  
**When** 服务启动  
**Then** `config.trustProxy` 应为 `true`

**Given** 容器启动时未指定 `DSH_HUB_COOKIE_SECURE`  
**When** 服务启动  
**Then** `config.cookieSecure` 应为 `true`

## 场景 3：DSH_HUB_DOMAIN 运行时指定

**Given** 容器启动时指定 `-e DSH_HUB_DOMAIN=hub.wuyajun.cn`  
**When** 生成实例访问链接  
**Then** 链接应使用 `hub.wuyajun.cn` 域名

**Given** 容器启动时未指定 `DSH_HUB_DOMAIN`  
**When** 生成实例访问链接  
**Then** 链接应使用默认值 `dshhub.local`（不推荐）

## 场景 4：数据库修复

**Given** 数据库中已有实例的 `trusted_host` 为 `dshhub.local`  
**When** 执行 `UPDATE instances SET trusted_host = 'hub.wuyajun.cn' WHERE trusted_host = 'dshhub.local'`  
**Then** 所有旧实例的链接应使用新域名

## 场景 5：DSH Client Loopback Patch

**Given** 容器启动  
**When** 执行 patch 脚本  
**Then** `client.js` 中的 `isLoopback` 检查应被绕过  
**And** 设置页面应能正常加载

**Given** DSH 版本更新或容器重建  
**When** 容器启动  
**Then** patch 脚本应自动重新执行
