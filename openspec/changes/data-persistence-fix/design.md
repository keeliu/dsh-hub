# 数据持久化修复技术方案

## 改动清单

### 1. `scripts/deploy_run.sh`

**当前逻辑**（第 18-28 行）：
```bash
if mkdir -p /mnt/data/dsh-hub 2>/dev/null && [ -w /mnt/data/dsh-hub ]; then
  export DSH_HUB_DATA="/mnt/data/dsh-hub"
else
  export DSH_HUB_DATA="/tmp/dsh-hub-data"
fi
```

**改为**：
```bash
if ! mkdir -p /mnt/data/dsh-hub 2>/dev/null || [ ! -w /mnt/data/dsh-hub ]; then
  echo "[deploy-run] 错误：持久化存储 /mnt/data 不可用或不可写"
  echo "[deploy-run] 请检查部署平台的存储配置，确保 /mnt/data 已挂载持久化卷"
  echo "[deploy-run] 如果是自建服务器，请使用 docker run -v /host/path:/mnt/data 启动"
  exit 1
fi
export DSH_HUB_DATA="/mnt/data/dsh-hub"
```

### 2. `Dockerfile`

**当前**（第 11 行）：
```dockerfile
ENV DSH_HUB_DATA=/data
VOLUME ["/data"]
```

**改为**：
```dockerfile
ENV DSH_HUB_DATA=/mnt/data/dsh-hub
VOLUME ["/mnt/data"]
```

## 关键决策

### 为什么不用 `/tmp` 回退

**决策**：去掉 `/tmp` 回退，改为启动失败。

**理由**：
- `/tmp` 回退的最大问题是**静默丢数据**——服务正常启动，用户正常使用，但容器重建后数据全部丢失。用户和运维都无法及时发现。
- 启动失败虽然会导致服务不可用，但错误信息明确，运维可以立即定位和修复。
- 「不可用」比「数据丢了但不知道」更好。

### 路径统一的原因

**决策**：Dockerfile 和 deploy 脚本统一使用 `/mnt/data/dsh-hub`。

**理由**：
- 当前 Dockerfile 用 `/data`，deploy 脚本用 `/mnt/data/dsh-hub`，两者不一致
- 如果 deploy 脚本的 `export` 没有生效（某些部署平台会忽略），会 fallback 到 Dockerfile 的 `/data`
- 统一路径消除歧义

## 影响范围

| 文件 | 改动行数 | 风险 |
|---|---|---|
| `scripts/deploy_run.sh` | ~5 行 | 中（需确认生产环境 `/mnt/data` 可用） |
| `Dockerfile` | ~2 行 | 低 |
