#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# dsh-hub 一键部署脚本
# 功能: 构建镜像、持久化环境变量、修复数据库、启动容器、健康检查
# 用法: ./deploy.sh [--rebuild] [--skip-db-fix]
# ============================================================

# ---------- 可配置变量 ----------
IMAGE_NAME="dsh-hub"
CONTAINER_NAME="dsh-hub"
HOST_PORT="3082"
DATA_DIR="/data/dsh-hub"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_PATH="${DATA_DIR}/dshhub.db"

# 默认环境变量（可通过 .env 文件覆盖）
DEFAULT_DOMAIN="hub.wuyajun.cn"
DEFAULT_TRUST_PROXY="1"
DEFAULT_COOKIE_SECURE="1"

# ---------- 参数解析 ----------
REBUILD=false
SKIP_DB_FIX=false
for arg in "$@"; do
  case "$arg" in
    --rebuild)    REBUILD=true ;;
    --skip-db-fix) SKIP_DB_FIX=true ;;
    *) echo "未知参数: $arg"; exit 1 ;;
  esac
done

# ---------- 工具函数 ----------
log()  { echo -e "\033[1;34m[INFO]\033[0m  $(date '+%H:%M:%S') $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m  $(date '+%H:%M:%S') $*"; }
err()  { echo -e "\033[1;31m[ERROR]\033[0m $(date '+%H:%M:%S') $*" >&2; }
die()  { err "$@"; exit 1; }

check_cmd() { command -v "$1" &>/dev/null || die "缺少必要命令: $1，请先安装"; }

# ---------- 前置检查 ----------
check_cmd docker
check_cmd sqlite3

# ---------- Step 1: 加载/生成 .env 文件 ----------
ENV_FILE="${PROJECT_DIR}/.env"
if [[ ! -s "$ENV_FILE" ]]; then
  log ".env 文件为空或不存在，自动生成默认配置..."
  cat > "$ENV_FILE" << ENV_EOF
# dsh-hub 环境变量配置
# 公网域名（用于生成实例链接）
DSH_HUB_DOMAIN=${DEFAULT_DOMAIN}
# 信任反向代理（OpenResty/Nginx 反代时必须设为 1）
DSH_HUB_TRUST_PROXY=${DEFAULT_TRUST_PROXY}
# Cookie Secure 标志（HTTPS 环境设为 1）
DSH_HUB_COOKIE_SECURE=${DEFAULT_COOKIE_SECURE}
# 服务监听地址与端口
DSH_HUB_HOST=0.0.0.0
DSH_HUB_PORT=3082
# 数据目录
DSH_HUB_DATA=/data
# dsh 二进制路径
DSH_BIN=/usr/local/bin/dsh
ENV_EOF
  log ".env 已生成: ${ENV_FILE}"
else
  log "加载已有 .env 配置: ${ENV_FILE}"
fi

# 读取 .env 中的 DOMAIN 用于后续 DB 修复
source <(grep -E '^DSH_HUB_DOMAIN=' "$ENV_FILE" | head -1)
TARGET_DOMAIN="${DSH_HUB_DOMAIN:-$DEFAULT_DOMAIN}"
log "目标域名: ${TARGET_DOMAIN}"

# ---------- Step 2: 确保数据目录存在 ----------
mkdir -p "$DATA_DIR"
log "数据目录就绪: ${DATA_DIR}"

# ---------- Step 3: 构建 Docker 镜像 ----------
if [[ "$REBUILD" == true ]] || ! docker image inspect "${IMAGE_NAME}:latest" &>/dev/null; then
  log "开始构建镜像 ${IMAGE_NAME}:latest ..."
  docker build -t "${IMAGE_NAME}:latest" -f "${PROJECT_DIR}/Dockerfile" "$(dirname ${PROJECT_DIR})"
  log "镜像构建完成"
else
  log "镜像 ${IMAGE_NAME}:latest 已存在，跳过构建（使用 --rebuild 强制重建）"
fi

# ---------- Step 4: 停止并移除旧容器 ----------
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  log "停止并移除旧容器 ${CONTAINER_NAME} ..."
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1
fi

# ---------- Step 5: 启动新容器 ----------
log "启动容器 ${CONTAINER_NAME} ..."
docker run -d \
  --network 1panel-network \
  --ip 172.18.0.3 \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -p "${HOST_PORT}:3082" \
  -v "${DATA_DIR}:/data" \
  "${IMAGE_NAME}:latest"

log "容器已启动，等待服务就绪..."
sleep 3

# ---------- Step 6: 健康检查 ----------
MAX_RETRIES=10
RETRY=0
until curl -sf "http://127.0.0.1:${HOST_PORT}/healthz" >/dev/null 2>&1; do
  RETRY=$((RETRY + 1))
  if [[ $RETRY -ge $MAX_RETRIES ]]; then
    err "健康检查失败（${MAX_RETRIES} 次重试后仍未通过）"
    docker logs --tail 50 "$CONTAINER_NAME"
    die "部署失败，请检查上方日志"
  fi
  warn "健康检查未通过 (${RETRY}/${MAX_RETRIES})，2秒后重试..."
  sleep 2
done
log "✅ 健康检查通过: http://127.0.0.1:${HOST_PORT}/healthz"

# ---------- Step 7: 数据库域名修复 ----------
if [[ "$SKIP_DB_FIX" == false ]] && [[ -f "$DB_PATH" ]]; then
  log "检查数据库中 trusted_host 字段..."
  WRONG_HOSTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM instances WHERE trusted_host != '${TARGET_DOMAIN}';" 2>/dev/null || echo "0")
  
  if [[ "$WRONG_HOSTS" -gt 0 ]]; then
    # 备份
    BACKUP="${DB_PATH}.bak.$(date +%Y%m%d%H%M%S)"
    cp "$DB_PATH" "$BACKUP"
    log "数据库已备份: ${BACKUP}"
    
    # 修复
    sqlite3 "$DB_PATH" "UPDATE instances SET trusted_host = '${TARGET_DOMAIN}' WHERE trusted_host != '${TARGET_DOMAIN}';"
    FIXED=$(sqlite3 "$DB_PATH" "SELECT changes();")
    log "✅ 已修复 ${FIXED} 条记录的 trusted_host → ${TARGET_DOMAIN}"
  else
    log "数据库 trusted_host 已全部正确，无需修复"
  fi
elif [[ "$SKIP_DB_FIX" == true ]]; then
  warn "已跳过数据库修复（--skip-db-fix）"
else
  warn "数据库文件不存在: ${DB_PATH}，跳过修复（首次部署属正常现象）"
fi

# ---------- 完成 ----------
echo ""
log "============================================"
log "🎉 dsh-hub 部署完成!"
log "============================================"
log "容器名称:   ${CONTAINER_NAME}"
log "服务端口:   ${HOST_PORT}"
log "公网域名:   ${TARGET_DOMAIN}"
log "数据目录:   ${DATA_DIR}"
log "配置文件:   ${ENV_FILE}"
log "健康检查:   http://127.0.0.1:${HOST_PORT}/healthz"
log "============================================"
log "常用命令:"
log "  查看日志:   docker logs -f ${CONTAINER_NAME}"
log "  重启服务:   docker restart ${CONTAINER_NAME}"
log "  重新部署:   ./deploy.sh --rebuild"
log "  仅修DB:     ./deploy.sh --skip-db-fix (不重建镜像)"
log "============================================"
