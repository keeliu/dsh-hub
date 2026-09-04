# 技术方案：修复 dsh 插件安装命令

## 背景

`dsh` CLI 的命令结构（`dsh --help` 输出）：

```
Commands:
  web [options] [args...]     boot the web profile (alias of --profile web)
  plugin [options] [args...]  manage a profile's plugins by forwarding the remaining arguments to pnpm in the profile directory

Options:
  --profile <name>            the profile under $DSH_HOME/profiles to boot
```

`dsh plugin` 将剩余参数转发给 profile 目录下的 pnpm，因此安装插件的正确语法是：

```
dsh plugin --profile web add <package>
```

## 关键决策

### 决策 1：profile 固定为 `web`

**选择**：所有 `dsh plugin` 调用固定使用 `--profile web`

**理由**：
- 项目只使用 `web` 类型 profile（调研笔记：`profiles/web` 首次使用从随包模板自动初始化）
- `dsh web` 本身就是 `--profile web` 的别名
- 没有 headless/tui 等其他 profile 的使用场景

### 决策 2：Dockerfile 构建时注入 DSH_HOME

**选择**：在每条 `dsh plugin` 命令前注入 `DSH_HOME=$TEMPLATE_DSH_HOME`

**理由**：
- `dsh plugin --profile web add` 会在 `$DSH_HOME/profiles/web` 目录下执行 pnpm add
- 不注入则默认装到 `~/.dsh/profiles/web`，与模板目录 `/opt/dsh-home-template` 不一致
- 运行时 `instances.ts` / `spawn.ts` 已通过 `env: { ...process.env, DSH_HOME: homePath }` 注入，无需额外处理

### 决策 3：profile 目录预创建

**选择**：在 Dockerfile 中 `mkdir -p $TEMPLATE_DSH_HOME/profiles/web` 确保目录存在

**理由**：
- `dsh plugin` 转发 pnpm 到 profile 目录，如果目录不存在可能报错
- 虽然 `dsh web` 首次启动会自动初始化 profile，但 `dsh plugin add` 是独立操作，不一定触发初始化

## 受影响文件

| 文件 | 行 | 变更 |
|---|---|---|
| `Dockerfile` | 8-15 | `dsh install` → `dsh plugin --profile web add`，注入 `DSH_HOME`，预创建 profile 目录 |
| `src/instances.ts` | 196 | `dsh install ${plugin}` → `dsh plugin --profile web add ${plugin}` |
| `src/supervisor/spawn.ts` | 72 | 同上 |
| `scripts/install-default-plugins.sh` | 32 | 同上 |
