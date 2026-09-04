# 实施清单：会员实例预置 DSH_HOME 模板

## 阶段 0：环境检查

- [ ] 0.1 检查 `dshp` 工具是否可用
  - 运行 `npx dshp --version` 或 `dshp --version`
  - 如果可用，优先使用 `dshp export/import` 方案
  - 如果不可用，使用手动复制方案

- [ ] 0.2 确认 DSH_HOME 目录结构
  - 检查现有实例的 `home/` 目录结构
  - 确认 Profile 包含所有必要文件（package.json、dsh.profile 等）

- [ ] 0.3 确认用户路径独立性
  - 验证每个用户的实例路径：`<dataDir>/users/<dir_name>/instances/<instanceId>/home/`
  - 确认模板复制时目标是每个实例的 `home/` 目录

## 阶段 1：模板管理模块

- [ ] 1.1 创建 `dsh-hub/src/profile-template.ts` 模块
  - `initTemplate()` - 初始化模板
  - `copyTemplate(instanceHome: string)` - 复制模板到实例 home（**必须复制整个目录**）
  - `isTemplateReady()` - 检查模板状态
  - `updateTemplate()` - 更新模板
  - `clearSensitiveInfo(homePath: string)` - 清除敏感信息

- [ ] 1.2 创建模板初始化脚本
  - `scripts/init-dsh-home-template.sh`
  - 预装基础插件（dsh-cost-meter 等）
  - 验证模板目录完整性

- [ ] 1.3 创建插件配置文件
  - `config/member-plugins.json`
  - 定义基础插件列表

## 阶段 2：实例创建流程改造

- [ ] 2.1 修改 `dsh-hub/src/instances.ts`
  - 改造 `copyPreinstalledPlugins` 函数
  - **关键**：复制整个 DSH_HOME 目录，不仅仅是 `node_modules`
  - 添加降级处理（模板不存在时使用原有逻辑）

- [ ] 2.2 修改 `dsh-hub/src/membership.ts`
  - 会员激活后调用新的实例创建流程

- [ ] 2.3 修改配置管理
  - `dsh-hub/src/config.ts` 添加模板相关配置
  - `USE_DSH_HOME_TEMPLATE` 开关
  - `TEMPLATE_DSH_HOME` 模板路径（默认 `/opt/dsh-home-template`）

## 阶段 3：配置修改与敏感信息清除

- [ ] 3.1 实现 DSH_HOME 配置修改
  - 清除 `.credentials.yaml`（API keys）
  - 清除 `.env`（环境变量）
  - 分配端口（从端口池获取）
  - 设置工作目录路径
  - 设置日志目录路径

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
  - 敏感信息清除测试

- [ ] 4.3 集成测试（需要 DSH 环境）
  - 初始化模板
  - 创建实例（模板存在）
  - 创建实例（模板不存在，降级）
  - 验证实例隔离性
  - **验证不同用户路径独立**

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
  - commit message: `feat(member): 实现会员实例预置 DSH_HOME 模板方案`

- [ ] 5.4 归档变更
  - 将 `openspec/changes/member-instance-template/` 移至 `openspec/changes/archive/`
