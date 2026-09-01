# 变更提案：Docker 构建与环境变量配置修复

## Why

1. **构建产物缺失**：`tsconfig.json` 设置 `noEmit: true`，`npm run build` 只做类型检查不输出文件，导致 `dist/index.js` 不存在，容器启动失败（Exit Code 1）
2. **环境变量缺失**：容器缺少 `DSH_HUB_DOMAIN`、`DSH_HUB_TRUST_PROXY`、`DSH_HUB_COOKIE_SECURE`，导致实例链接域名错误、反代信任问题、Cookie 安全标志缺失

## What Changes

1. 修改 Dockerfile，移除 `npm run build` 步骤，改为直接运行 TypeScript 源码
2. 添加 `DSH_HUB_TRUST_PROXY=1` 和 `DSH_HUB_COOKIE_SECURE=1` 到 Dockerfile 默认环境变量
3. `DSH_HUB_DOMAIN` 通过运行时 `-e` 参数指定
4. 添加 `.dockerignore` 排除无关文件

## Impact

- **受影响模块**：`Dockerfile`、`.dockerignore`
- **用户可见**：容器能正常启动，实例链接显示正确域名
- **向后兼容**：是，不影响现有数据卷
