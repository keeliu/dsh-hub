#!/bin/bash
# DSH Hub · 构建 docker 镜像（自动切换到正确的构建上下文）
# 用法: bash scripts/build-image.sh [镜像名]      # 默认 dsh-hub:latest
#
# 为什么需要这个脚本：
#   Dockerfile 里的 COPY scripts/patch-dsh-client.sh、COPY package.json 等是
#   相对【构建上下文】解析的。上下文必须是 app 代码目录（含 Dockerfile 的那个目录）。
#   如果从仓库根执行 `docker build -f dsh-hub/Dockerfile .`，上下文错为仓库根，
#   会报 "scripts/patch-dsh-client.sh: not found"。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../dsh-hub" && pwd)"
IMAGE="${1:-dsh-hub:latest}"

cd "$APP_DIR"

echo "[build-image] 构建上下文（app 目录）: $APP_DIR"
echo "[build-image] 镜像标签: $IMAGE"

docker build -t "$IMAGE" .

echo "[build-image] 完成: $IMAGE"
