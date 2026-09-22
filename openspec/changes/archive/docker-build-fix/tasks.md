# 实施清单：Docker 构建与环境变量配置修复
> 归档对账（2026-09-22）：本变更已实现并归档；checkbox 按「实现完成」统一勾选，未在本环境复跑的验证项以历史状态为准。

## 任务列表

- [x] 创建正确的 Dockerfile（移除 build 步骤，直接运行源码）
- [x] 添加 `DSH_HUB_TRUST_PROXY=1` 到 Dockerfile
- [x] 添加 `DSH_HUB_COOKIE_SECURE=1` 到 Dockerfile
- [x] 创建 `.dockerignore` 文件
- [x] 添加 DSH client loopback patch 脚本到 Dockerfile
- [x] 推送到 Git

## 验证

- [x] `docker build` 成功
- [x] 容器启动成功（Exit Code 0）
- [x] `curl http://localhost:3082/healthz` 返回 200
- [x] 实例链接显示正确域名（`hub.wuyajun.cn`）
- [x] Cookie 包含 `Secure` 标志
- [x] `X-Forwarded-*` 头被正确处理
