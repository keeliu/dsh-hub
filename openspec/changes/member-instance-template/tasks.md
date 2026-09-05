# 实施清单：会员实例预置模板

## 阶段 1：环境准备

- [ ] 1.1 创建模板目录
  - 在服务器上创建 `/opt/dsh-home-template` 目录
  - 设置正确的权限（755）

- [ ] 1.2 初始化模板 Profile
  - 手动创建一个临时 DSH 实例
  - 安装所有默认插件（`dshmarket`、`DSH-better-sidebar`、`dsh-im`、`dsh-cost-meter`、`dsh-visualize`）
  - 验证插件安装成功
  - **关键**：确保 `profiles/node_modules/` 目录存在（由 `healProfilesModuleFallback` 机制创建）

- [ ] 1.3 导出模板
  - 将临时实例的 `home/` 目录复制到 `/opt/dsh-home-template`
  - 清除敏感信息（`.credentials.yaml`、`.env` 等）
  - 验证模板目录结构完整，包含：
    - `profiles/web/` 目录（包含所有配置文件和插件）
    - `profiles/node_modules/` 目录（共享依赖）
    - `.npmrc` 文件

## 阶段 2：代码修改 - 修复复制逻辑

- [ ] 2.1 修改 `copyPreinstalledPlugins()` 函数
  - 文件：`dsh-hub/src/instances.ts`
  - 修改：复制整个 `profiles/` 目录（包括 `web/` 和 `node_modules/`）
  - **关键**：使用 `verbatimSymlinks: false` 选项处理符号链接
  - 验证：复制后目录结构与模板一致
  - 验证：`profiles/node_modules/` 是实际目录（非符号链接）

- [ ] 2.2 删除 `installDefaultPlugins()` 函数
  - 文件：`dsh-hub/src/instances.ts`
  - 删除：第 172-220 行的函数定义
  - 删除：第 94 行的函数调用

- [ ] 2.3 删除 `spawn.ts` 中的插件安装兜底逻辑
  - 文件：`dsh-hub/src/supervisor/spawn.ts`
  - 删除：第 55-94 行的插件安装检查逻辑
  - 保留：`ensureInstanceDirs()` 和启动逻辑

## 阶段 3：代码修改 - 统一常量

- [ ] 3.1 在 `config.ts` 中新增 `DEFAULT_PLUGINS` 常量
  - 文件：`dsh-hub/src/config.ts`
  - 新增：导出 `DEFAULT_PLUGINS` 数组
  - 用途：文档说明和模板初始化参考

- [ ] 3.2 删除 `instances.ts` 中的 `DEFAULT_PLUGINS` 定义
  - 文件：`dsh-hub/src/instances.ts`
  - 删除：第 19-25 行的常量定义

- [ ] 3.3 删除 `spawn.ts` 中的 `DEFAULT_PLUGINS` 定义
  - 文件：`dsh-hub/src/supervisor/spawn.ts`
  - 删除：第 16-22 行的常量定义

## 阶段 4：验证

- [ ] 4.1 类型检查
  - 运行 `npx tsc -p . --noEmit`
  - 确认无类型错误

- [ ] 4.2 单元测试（如有）
  - 运行相关单元测试
  - 确认测试通过

- [ ] 4.3 手动验证 - 模板目录检查
  - 检查 `/opt/dsh-home-template` 目录结构
  - 确认包含完整的 Profile 文件
  - **关键**：确认 `profiles/node_modules/` 目录存在

- [ ] 4.4 手动验证 - 实例创建流程
  - 创建测试用户
  - 触发实例创建
  - 验证实例 `home/profiles/web/` 目录完整
  - **关键**：验证实例 `home/profiles/node_modules/` 目录存在且内容完整
  - 验证 `.plugins-installed` 标记文件创建

- [ ] 4.5 手动验证 - 用户路径独立性
  - 创建两个不同用户的实例
  - 比较两个实例的 Profile 目录路径
  - 确认路径完全不同且相互隔离

- [ ] 4.6 手动验证 - 代码清理
  - 确认 `installDefaultPlugins()` 函数已删除
  - 确认 `spawn.ts` 中的插件安装兜底逻辑已删除
  - 确认 `DEFAULT_PLUGINS` 只在 `config.ts` 中定义

- [ ] 4.7 手动验证 - 符号链接处理
  - 检查模板目录中的 `profiles/node_modules/` 是否为符号链接
  - 如果是符号链接，验证实例目录中的对应目录是实际目录（非符号链接）
  - 验证实例目录中的依赖文件完整

## 阶段 5：文档与归档

- [ ] 5.1 更新 AGENTS.md
  - 在"当前进度"中添加会员实例预置模板完成记录

- [ ] 5.2 提交代码
  - commit message: `feat(member): 实现会员实例预置模板方案，修复 Profile 复制逻辑`

- [ ] 5.3 归档变更
  - 将 `openspec/changes/member-instance-template/` 移至 `openspec/changes/archive/`
