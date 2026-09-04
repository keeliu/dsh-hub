# 实施清单：会员实例预置模板

## 阶段 0：环境检查

- [ ] 0.1 检查 `dshp` 工具是否可用
  - 运行 `npx dshp --version` 或 `dshp --version`
  - 如果可用，优先使用 `dshp export/import` 方案
  - 如果不可用，使用手动复制方案

- [ ] 0.2 确认 DSH Profile 目录结构
  - 检查 `~/.dsh/profiles/` 目录
  - 确认 Profile 包含所有必要文件（package.json、dsh.profile 等）

## 阶段 1：模板管理模块

- [ ] 1.1 创建 `dsh-hub/src/profile-template.ts` 模块
  - `initTemplate()` - 初始化模板
  - `copyTemplate(userId)` - 复制模板创建新 Profile（**必须复制整个目录**）
  - `isTemplateReady()` - 检查模板状态
  - `updateTemplate()` - 更新模板
  - `clearSensitiveInfo(profileDir)` - 清除敏感信息

- [ ] 1.2 创建模板初始化脚本
  - `scripts/init-member-template.sh`
  - 预装基础插件（dsh-cost-meter 等）
  - 验证模板目录完整性

- [ ] 1.3 创建插件配置文件
  - `config/member-plugins.json`
  - 定义基础插件列表

## 阶段 2：实例创建流程改造

- [ ] 2.1 修改 `dsh-hub/src/instances.ts`
  - 集成模板复制逻辑
  - 添加降级处理（模板不存在时使用原有逻辑）

- [ ] 2.2 修改 `dsh-hub/src/membership.ts`
  - 会员激活后调用新的实例创建流程

- [ ] 2.3 修改配置管理
  - `dsh-hub/src/config.ts` 添加模板相关配置
  - `USE_PROFILE_TEMPLATE` 开关
  - `TEMPLATE_PROFILE_NAME` 模板名称

## 阶段 3：配置修改与敏感信息清除

- [ ] 3.1 实现 Profile 配置修改
  - 修改用户标识
  - 分配端口
  - 设置工作目录
  - 设置日志目录

- [ ] 3.2 实现敏感信息清除（**重要**）
  - 清除 `.credentials.yaml`（API keys）
  - 清除 `.env`（环境变量）
  - 清除其他用户特定的配置
  - 验证清除后的配置文件完整性

## 阶段 4：验证

- [ ] 4.1 类型检查
  - 运行 `npx tsc -p . --noEmit`

- [ ] 4.2 单元测试
  - 模板复制逻辑测试
  - 配置修改逻辑测试

- [ ] 4.3 集成测试（需要 DSH 环境）
  - 初始化模板
  - 创建实例（模板存在）
  - 创建实例（模板不存在，降级）
  - 验证实例隔离性

- [ ] 4.4 性能测试
  - 对比模板方案 vs 动态安装的创建耗时
  - 目标：模板方案 < 10 秒

## 阶段 5：文档与归档

- [ ] 5.1 更新 AGENTS.md
  - 记录模板方案实现

- [ ] 5.2 创建运维文档
  - 模板初始化步骤
  - 模板更新步骤
  - 故障排查指南

- [ ] 5.3 提交代码
  - commit message: `feat(member): 实现会员实例预置模板方案`

- [ ] 5.4 归档变更
  - 将 `openspec/changes/member-instance-template/` 移至 `openspec/changes/archive/`
