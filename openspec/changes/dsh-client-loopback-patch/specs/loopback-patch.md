# 功能规范：DSH Client Loopback 检查 Patch

## 场景 1：首次容器启动

**Given** 新构建的 Docker 镜像  
**When** 容器首次启动  
**Then** patch 脚本应执行  
**And** 日志应输出 `[patch] Successfully patched DSH client.js loopback check`  
**And** `client.js` 中的 `isLoopback` 应返回 `true`

## 场景 2：重复容器启动

**Given** 已 patch 的容器  
**When** 容器重启  
**Then** patch 脚本应检测到已 patch  
**And** 日志应输出 `[patch] Already patched, skipping`  
**And** 不应重复修改文件

## 场景 3：DSH 版本更新

**Given** DSH 版本更新导致 `client.js` 被替换  
**When** 容器重建并启动  
**Then** patch 脚本应重新执行  
**And** 新版本的 `client.js` 应被 patch

## 场景 4：client.js 不存在

**Given** DSH 安装路径变化或文件不存在  
**When** patch 脚本执行  
**Then** 脚本应输出 `[patch] DSH client.js not found, skipping`  
**And** 脚本应正常退出（exit 0）  
**And** Hub 服务应正常启动

## 场景 5：设置页面访问

**Given** 用户通过 `hub.wuyajun.cn` 访问 DSH 实例  
**When** 进入设置 → 模型页面  
**Then** 页面应正常加载提供方目录  
**And** 不应显示 "settings are unavailable in this browser"
