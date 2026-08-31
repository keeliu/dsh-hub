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
export DSH_HUB_DATA="${DSH_HUB_DATA:-/tmp/dsh-hub-data}"

# 确保数据目录存在
mkdir -p "$DSH_HUB_DATA"

echo "[deploy-run] 启动 DSH Hub @ ${DSH_HUB_HOST}:${DSH_HUB_PORT}"
echo "[deploy-run] 数据目录: $DSH_HUB_DATA"
exec node --disable-warning=ExperimentalWarning src/index.ts
