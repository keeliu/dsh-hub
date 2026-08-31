#!/bin/bash
# DSH Hub · 部署构建脚本
# 安装项目依赖（运行时零依赖，仅安装 devDependencies 用于类型检查）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../dsh-hub" && pwd)"

cd "$PROJECT_DIR"

echo "[deploy-build] 安装依赖..."
pnpm install --frozen-lockfile

echo "[deploy-build] 构建完成"
