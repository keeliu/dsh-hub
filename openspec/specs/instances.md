# 实例管理规范

> 状态：已实现（M2 + M2.1 安全修复）
> 模块：`src/instances.ts`、`src/supervisor.ts`、`src/port.ts`、`src/paths.ts`

## Requirement: 实例目录布局

每个用户的实例数据存储在独立的目录结构中。

Scenario: 目录结构
- GIVEN 用户 dir_name = "alice"，实例 id = "i-abc12345"
- THEN 目录布局为：
  ```
  users/alice/
    instances/i-abc12345/
      home/         # DSH_HOME
      workspace/    # dsh 进程 cwd
      logs/         # web.out.log + start-fail-*.md
      instance.pid
      .dsh-instance.lock
  ```

Scenario: 用户目录权限
- WHEN 用户目录被创建或访问
- THEN 权限为 700（仅属主可访问）

## Requirement: 端口分配

系统为每个实例分配独立的回环端口。

Scenario: 端口范围
- WHEN 分配端口
- THEN 从 4000-4999 范围内选取
- AND 避开 3080/3081（保留端口）

Scenario: 双保险分配
- WHEN 分配端口
- THEN 检查 DB 中未被占用（port UNIQUE）
- AND TCP 探活确认未被监听（500ms 超时）

Scenario: 端口耗尽
- GIVEN 4000-4999 全部被占用
- WHEN 尝试创建新实例
- THEN 返回 503 `no_free_port`

Scenario: 并发端口冲突
- GIVEN 两个创建请求并发分配到同一端口
- WHEN INSERT 时 UNIQUE 冲突
- THEN 事务回滚，重新分配端口重试一次

## Requirement: 实例创建

用户可创建新的 dsh web 实例。

Scenario: 正常创建
- GIVEN 用户已登录且 max_instances 配额未满
- WHEN 发送 `POST /api/instances` 提供 name
- THEN 分配端口、创建目录、写入 DB
- AND 返回实例信息（status=stopped）

Scenario: 配额检查
- GIVEN 用户已有 max_instances 个实例
- WHEN 尝试创建新实例
- THEN 返回 403 `quota_exceeded`

Scenario: 配额事务化
- GIVEN 两个创建请求并发到达
- WHEN 配额恰好够一个
- THEN 仅一个成功（BEGIN IMMEDIATE 串行化）

Scenario: 版本白名单
- GIVEN `allowed_harness_versions` 设置为 "0.1.1,0.1.2"
- WHEN 创建实例指定 harness_version="0.1.3"
- THEN 返回 403 `harness_version_not_allowed`

Scenario: 默认版本
- GIVEN `default_harness_version` 设置为 "0.1.1"
- WHEN 创建实例未指定版本
- THEN 使用默认版本

Scenario: trusted_host 生成
- GIVEN 用户 slug = "alice"，实例 id = "i-abc12345"
- WHEN 实例创建
- THEN trusted_host = "alice-i-abc12345.dshhub.local"

Scenario: 目录创建失败补偿
- GIVEN 目录创建失败（如磁盘满）
- WHEN 创建实例
- THEN 已创建的目录被删除（不残留孤儿目录）

## Requirement: 实例启动

用户可启动已创建的实例。

Scenario: 正常启动
- GIVEN 实例 status=stopped
- WHEN 发送 `POST /api/instances/:id/start`
- THEN spawn `dsh web --host 127.0.0.1 --port <port> --trusted-host <host> --no-open`
- AND 独立进程组（setsid/detached）
- AND env 注入 DSH_HOME
- AND cwd = workspace
- AND 日志输出到 logs/web.out.log

Scenario: TCP 探活
- GIVEN 实例正在启动
- WHEN TCP 探活（127.0.0.1:port）成功
- THEN status 变为 running，记录 pid 和 last_started_at

Scenario: 启动超时
- GIVEN 180 秒内 TCP 探活未成功
- WHEN 启动超时
- THEN status 变为 failed
- AND 写入 start-fail-<timestamp>.md 快照

Scenario: 子进程早退
- GIVEN dsh 进程在探活期间退出
- WHEN 检测到进程退出
- THEN 立即中止探活（不白等 180s）
- AND 按退出码生成失败快照

Scenario: 启动并发互斥
- GIVEN 同一实例正在启动中
- WHEN 第二个 start 请求到达
- THEN 返回 409 `instance_busy`

Scenario: max_running 配额
- GIVEN 用户已有 max_running 个运行中实例
- WHEN 尝试启动新实例
- THEN 返回 403 `quota_exceeded`

Scenario: spawn error 处理
- GIVEN dsh 二进制不存在
- WHEN spawn 触发 error 事件
- THEN 不拖垮 hub 进程
- AND status 变为 failed

## Requirement: 实例停止

用户可停止运行中的实例。

Scenario: 正常停止
- GIVEN 实例 status=running
- WHEN 发送 `POST /api/instances/:id/stop`
- THEN 发送 TERM 到进程组
- AND 等待 8 秒
- AND 若仍存活发送 KILL
- AND 确认端口释放（2s 内）
- AND status 变为 stopped

Scenario: 进程组清理
- GIVEN 实例有多个子进程
- WHEN 停止
- THEN 等待整个进程组清空（不只等组长）

Scenario: 进程身份校验
- GIVEN pid 可能被 OS 复用
- WHEN 停止前校验
- THEN 检查 /proc/<pid>/cmdline 包含 "dsh" 和 "--port <port>"
- AND 不匹配则视为死实例，不 kill

Scenario: 停止并发互斥
- GIVEN 同一实例正在停止中
- WHEN 第二个 stop 请求到达
- THEN 返回 409 `instance_busy`

## Requirement: 实例重启

Scenario: 正常重启
- GIVEN 实例 status=running
- WHEN 发送 `POST /api/instances/:id/restart`
- THEN 先停止再启动
- AND 重新检查 max_running 配额

## Requirement: 实例删除

Scenario: 正常删除
- GIVEN 实例已停止
- WHEN 发送 `DELETE /api/instances/:id`
- THEN 删除 DB 记录
- AND 删除实例目录（含 home/workspace/logs）

Scenario: 目录残留告警
- GIVEN 目录删除失败
- WHEN 删除实例
- THEN 记录错误日志（不静默吞掉）

## Requirement: 实例日志

Scenario: 查看日志
- GIVEN 实例有 logs/web.out.log
- WHEN 发送 `GET /api/instances/:id/logs?tail=200`
- THEN 返回日志尾部 200 行（不整文件读入）

Scenario: 日志轮转
- GIVEN web.out.log 超过 16MiB
- WHEN 写入新日志
- THEN 旧日志重命名为 web.out.log.1
- AND 新日志写入 web.out.log

## Requirement: 孤儿认领

系统重启后可认领未被正确关闭的实例。

Scenario: reclaim 校正状态
- GIVEN hub 重启前实例 status=running 但进程已不存在
- WHEN reclaim() 执行
- THEN 实例 status 校正为 stopped

Scenario: 进程存活认领
- GIVEN hub 重启前实例 status=running 且进程仍存活
- WHEN reclaim() 执行且进程身份校验通过
- THEN 实例 status 保持 running

## Requirement: 实例所有权

Scenario: 属主访问
- GIVEN 实例 owner_id = 当前用户 id
- WHEN 访问实例
- THEN 允许

Scenario: 管理员跨用户访问
- GIVEN actor 为 admin 或 root
- WHEN 访问他人实例
- THEN 允许（读操作 404 不泄露存在性，写操作记审计）

Scenario: 非属主非管理员
- GIVEN 实例不属于当前用户且 actor 非管理员
- WHEN 尝试访问
- THEN 读操作返回 404，写操作返回 403

## Requirement: 版本固定

Scenario: 指定版本启动
- GIVEN 实例 harness_version = "0.1.1"
- WHEN 启动
- THEN 执行 `npx --yes @deepseek-ai/dsh@0.1.1 web ...`

Scenario: 未指定版本
- GIVEN 实例 harness_version 为空
- WHEN 启动
- THEN 使用系统 PATH 中的 dsh 二进制
