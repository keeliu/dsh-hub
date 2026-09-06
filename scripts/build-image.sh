#!/bin/bash
# DSH Hub · 构建 docker 镜像（上下文 = 仓库根）
# 用法: bash scripts/build-image.sh [镜像名]      # 默认 dsh-hub:latest
#
# Dockerfile 的 COPY 路径均为【仓库根相对路径】(dsh-hub/...)，所以构建上下文必须是仓库根：
#   docker build -f dsh-hub/Dockerfile .
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IMAGE="${1:-dsh-hub:latest}"

cd "$REPO_DIR"

echo "[build-image] 构建上下文（仓库根）: $REPO_DIR"
echo "[build-image] Dockerfile: dsh-hub/Dockerfile"
echo "[build-image] 镜像标签: $IMAGE"

docker build -f dsh-hub/Dockerfile -t "$IMAGE" .

echo "[build-image] 完成: $IMAGE"
