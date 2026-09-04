# 验收规范：会员实例预置模板

## 场景 1：模板初始化

**Given** 系统首次部署或管理员手动触发
**When** 执行模板初始化命令
**Then** 创建 `member-template` Profile
**And** 安装所有基础插件（dsh-cost-meter 等）
**And** 模板状态标记为 ready

## 场景 2：会员购买后快速创建实例

**Given** 用户购买会员并支付成功
**When** 系统触发会员激活流程
**Then** 从 `member-template` 复制创建新 Profile
**And** 修改 Profile 配置（用户标识、端口等）
**And** 启动 DSH 实例
**And** 整个创建过程在 10 秒内完成

## 场景 3：模板更新

**Given** 管理员需要更新基础插件列表
**When** 管理员执行模板更新命令
**Then** 更新 `member-template` Profile 的插件
**And** 已创建的实例不受影响
**And** 新创建的实例使用更新后的模板

## 场景 4：模板不存在时的降级处理

**Given** `member-template` Profile 不存在或损坏
**When** 用户购买会员触发实例创建
**Then** 系统记录错误日志
**And** 回退到原有创建方式（动态安装插件）
**And** 通知管理员修复模板

## 场景 5：实例隔离性

**Given** 多个会员用户各自拥有实例
**When** 用户访问自己的实例
**Then** 每个实例使用独立的 Profile 目录
**And** 实例间数据完全隔离
**And** 用户无法访问其他用户的实例

## 场景 6：模板目录权限

**Given** 模板目录包含敏感配置
**When** 系统复制模板创建新 Profile
**Then** 新 Profile 目录权限正确（仅所有者可访问）
**And** 敏感配置（如 API keys）已清除或重置
