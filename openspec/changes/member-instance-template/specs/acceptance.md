# 验收规范：会员实例预置 DSH_HOME 模板

## 场景 1：模板初始化

**Given** 系统首次部署或管理员手动触发
**When** 执行模板初始化脚本
**Then** 创建 `/opt/dsh-home-template/` 目录
**And** 目录包含完整的 DSH_HOME 结构（profiles/web/ 及所有必要文件）
**And** 基础插件已安装（dsh-cost-meter 等）
**And** 模板状态标记为 ready

## 场景 2：会员购买后快速创建实例

**Given** 用户购买会员并支付成功
**When** 系统触发会员激活流程
**Then** 从模板复制完整的 DSH_HOME 到实例的 `home/` 目录
**And** 清除敏感信息（`.credentials.yaml`、`.env`）
**And** 启动 DSH 实例
**And** 整个创建过程在 10 秒内完成

## 场景 3：DSH_HOME 目录完整性

**Given** 从模板复制创建新实例
**When** 检查实例的 `home/` 目录
**Then** 目录包含所有必要文件：
- `profiles/web/package.json`
- `profiles/web/dsh.profile`
- `profiles/web/pnpm-lock.yaml`
- `profiles/web/pnpm-workspace.yaml`
- `profiles/web/cordis.patch.yml`
- `profiles/web/node_modules/` 目录

## 场景 4：敏感信息清除

**Given** 从模板复制创建新实例
**When** 检查实例的 `home/` 目录
**Then** 敏感信息已被清除：
- 无 `.credentials.yaml` 文件
- 无 `.env` 文件
- 无其他用户特定的配置
**And** 新实例可以正常启动

## 场景 5：模板更新

**Given** 管理员需要更新基础插件列表
**When** 管理员执行模板更新脚本
**Then** 更新 `/opt/dsh-home-template/` 目录
**And** 已创建的实例不受影响
**And** 新创建的实例使用更新后的模板

## 场景 6：模板不存在时的降级处理

**Given** `/opt/dsh-home-template/` 目录不存在或损坏
**When** 用户购买会员触发实例创建
**Then** 系统记录错误日志
**And** 回退到原有创建方式（动态安装插件）
**And** 通知管理员修复模板

## 场景 7：实例隔离性

**Given** 多个会员用户各自拥有实例
**When** 用户访问自己的实例
**Then** 每个实例使用独立的 `home/` 目录
**And** 实例间数据完全隔离
**And** 用户无法访问其他用户的实例

## 场景 8：不同用户路径独立

**Given** 用户 A 和用户 B 各自购买会员
**When** 系统为两个用户创建实例
**Then** 用户 A 的实例路径：`<dataDir>/users/<userA_dir>/instances/<idA>/home/`
**And** 用户 B 的实例路径：`<dataDir>/users/<userB_dir>/instances/<idB>/home/`
**And** 两个实例的 DSH_HOME 路径完全不同
**And** 两个实例都从同一模板复制，但配置独立

## 场景 9：模板目录权限

**Given** 模板目录包含预装插件
**When** 系统复制模板创建新实例
**Then** 新实例目录权限正确（仅所有者可访问）
**And** 敏感配置已清除或重置
