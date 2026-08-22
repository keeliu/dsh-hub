# DSH Hub

多人使用的 DeepSeek Harness（dsh）多实例管理器：单台 Linux 服务器，网页登录，
每用户一个昵称目录，实例与数据严格隔离，管理员后台统一管理。

- 调研依据：`../docs/01-调研笔记.md`
- 开发计划：`../docs/02-开发计划.md`
- Spike 验证记录：`../docs/03-Spike验证记录.md`

## 目录

```
src/       控制面（TypeScript）：auth/ gateway/ supervisor/ ...
spikes/    M0 技术验证脚本（零依赖，可独立运行）
```

## Spike 运行方式

```bash
pnpm run spike:s1   # dsh web 经 Node 反代（含 WS）可达性
pnpm run spike:s2   # --trusted-host 匹配规则静态分析
pnpm run spike:s3   # systemd-run 资源限额可行性
pnpm run spike:s4   # npx 固定版本冷启动（需外网）
pnpm run spike:s5   # 中文昵称目录 ext4 行为
```

> Spike 一律避开 3080/3081（主实例与现有 GUI 占用），默认使用 3971/3972。
