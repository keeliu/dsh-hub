# Tasks: supervisor 模块拆分

## 阶段 1：创建子模块

- [ ] 1.1 创建 `supervisor/probe.ts`，迁移探活和进程检测函数
- [ ] 1.2 创建 `supervisor/lock.ts`，迁移锁管理函数
- [ ] 1.3 创建 `supervisor/pidfile.ts`，迁移 pidfile 管理函数
- [ ] 1.4 创建 `supervisor/log.ts`，迁移日志相关函数
- [ ] 1.5 创建 `supervisor/spawn.ts`，迁移启动逻辑
- [ ] 1.6 创建 `supervisor/stop.ts`，迁移停止逻辑
- [ ] 1.7 创建 `supervisor/reclaim.ts`，迁移孤儿认领逻辑
- [ ] 1.8 创建 `supervisor/index.ts`，re-export 公共 API + 定义 InstanceRecord 类型

## 阶段 2：更新 import 路径

- [ ] 2.1 `api.ts` 更新 import from `'./supervisor/index.ts'`
- [ ] 2.2 `pages.ts` 更新 import
- [ ] 2.3 `instances.ts` 更新 import
- [ ] 2.4 `index.ts` 更新 import

## 阶段 3：清理

- [ ] 3.1 删除旧 `supervisor.ts`
- [ ] 3.2 确认无残留 import 引用旧路径

## 阶段 4：验证

- [ ] 4.1 类型检查通过
- [ ] 4.2 冒烟测试通过
- [ ] 4.3 确认每个子模块 ≤ 150 行
- [ ] 4.4 归档变更

## 预估时间

- 阶段 1：1.5 小时
- 阶段 2：30 分钟
- 阶段 3：15 分钟
- 阶段 4：30 分钟
- **总计：2.5 小时**
