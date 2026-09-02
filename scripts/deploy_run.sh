#!/bin/bash
# DSH Hub · 部署运行脚本
# 启动 HTTP 服务，监听 0.0.0.0:5000

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../dsh-hub" && pwd)"

cd "$PROJECT_DIR"

# 部署环境配置
export DSH_HUB_HOST="${DSH_HUB_HOST:-0.0.0.0}"
export DSH_HUB_PORT="${DSH_HUB_PORT:-5000}"
export DSH_HUB_DOMAIN="${DSH_HUB_DOMAIN:-hub.wuyajun.cn}"

# 数据目录：优先使用持久化存储 /mnt/data，不可用时回退到 /tmp
if [ -z "${DSH_HUB_DATA:-}" ]; then
  # 尝试使用平台挂载的持久化存储
  if mkdir -p /mnt/data/dsh-hub 2>/dev/null && [ -w /mnt/data/dsh-hub ]; then
    export DSH_HUB_DATA="/mnt/data/dsh-hub"
    echo "[deploy-run] 使用持久化存储：/mnt/data/dsh-hub"
  else
    export DSH_HUB_DATA="/tmp/dsh-hub-data"
    echo "[deploy-run] 警告：/mnt/data 不可用，使用临时存储 /tmp/dsh-hub-data"
    echo "[deploy-run] 警告：容器重启后数据将丢失！请检查平台存储配置"
  fi
fi

# 确保数据目录存在
mkdir -p "$DSH_HUB_DATA" || {
  echo "[deploy-run] 错误：无法创建数据目录 $DSH_HUB_DATA"
  exit 1
}

echo "[deploy-run] 启动 DSH Hub @ ${DSH_HUB_HOST}:${DSH_HUB_PORT}"
echo "[deploy-run] 数据目录：$DSH_HUB_DATA"
exec node --disable-warning=ExperimentalWarning src/index.ts
