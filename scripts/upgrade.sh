#!/bin/bash
# DSH Hub 升级脚本
# 使用方法: bash scripts/upgrade.sh

set -e

echo "=== DSH Hub 升级脚本 ==="
echo "时间: $(date)"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 进入项目目录
cd "$PROJECT_DIR"

# 1. 备份数据库
echo "[1/5] 备份数据库..."
DATA_DIR="${DSH_HUB_DATA:-/data/dsh-hub}"
if [ -f "$DATA_DIR/hub.db" ]; then
    BACKUP_FILE="$DATA_DIR/hub.db.$(date +%Y%m%d%H%M%S)"
    cp "$DATA_DIR/hub.db" "$BACKUP_FILE"
    echo "  备份到: $BACKUP_FILE"
else
    echo "  数据库不存在，跳过备份"
fi

# 2. 拉取最新代码
echo "[2/5] 拉取最新代码..."
git pull origin main

# 3. 安装依赖（如果有新增）
echo "[3/5] 安装依赖..."
cd dsh-hub
pnpm install --prod

# 4. 重启服务
echo "[4/5] 重启服务..."
if systemctl is-active --quiet dsh-hub 2>/dev/null; then
    sudo systemctl restart dsh-hub
    echo "  使用 systemd 重启"
else
    # 如果没有 systemd 服务，手动重启
    pkill -f "node.*src/index.ts" 2>/dev/null || true
    sleep 2
    DSH_HUB_DATA="${DSH_HUB_DATA:-/data/dsh-hub}" \
    DSH_HUB_HOST="${DSH_HUB_HOST:-0.0.0.0}" \
    DSH_HUB_PORT="${DSH_HUB_PORT:-5000}" \
    DSH_HUB_DOMAIN="${DSH_HUB_DOMAIN:-hub.wuyajun.cn}" \
    nohup node --disable-warning=ExperimentalWarning src/index.ts > /var/log/dsh-hub.log 2>&1 &
    echo "  手动启动服务"
fi

# 5. 验证服务
echo "[5/5] 验证服务..."
sleep 3
if curl -s http://127.0.0.1:5000/healthz | grep -q "ok"; then
    echo "✅ 升级成功！"
else
    echo "❌ 服务启动失败，请检查日志"
    echo "日志位置: /var/log/dsh-hub.log"
    tail -20 /var/log/dsh-hub.log 2>/dev/null || true
fi

echo "=== 升级完成 ==="
