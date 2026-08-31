#!/bin/bash
# DSH Hub 回滚脚本
# 使用方法: bash scripts/rollback.sh [commit-hash]

set -e

echo "=== DSH Hub 回滚脚本 ==="
echo "时间: $(date)"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 进入项目目录
cd "$PROJECT_DIR"

# 显示最近的提交
echo "最近的提交记录:"
git log --oneline -10

# 如果提供了 commit hash，回滚到指定版本
if [ -n "$1" ]; then
    COMMIT=$1
    echo ""
    echo "将回滚到: $COMMIT"
    read -p "确认回滚? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "取消回滚"
        exit 0
    fi
    
    # 回滚代码
    git reset --hard $COMMIT
    echo "代码已回滚到: $COMMIT"
else
    # 回滚到上一个版本
    echo ""
    echo "将回滚到上一个版本"
    read -p "确认回滚? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "取消回滚"
        exit 0
    fi
    
    git reset --hard HEAD~1
    echo "代码已回滚到上一个版本"
fi

# 恢复数据库备份（如果存在）
DATA_DIR="${DSH_HUB_DATA:-/data/dsh-hub}"
LATEST_BACKUP=$(ls -t "$DATA_DIR"/hub.db.* 2>/dev/null | head -1)

if [ -n "$LATEST_BACKUP" ]; then
    echo ""
    echo "找到最近的数据库备份: $LATEST_BACKUP"
    read -p "是否恢复数据库? (y/N): " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        cp "$LATEST_BACKUP" "$DATA_DIR/hub.db"
        echo "数据库已恢复"
    fi
fi

# 重启服务
echo ""
echo "重启服务..."
cd dsh-hub
if systemctl is-active --quiet dsh-hub 2>/dev/null; then
    sudo systemctl restart dsh-hub
else
    pkill -f "node.*src/index.ts" 2>/dev/null || true
    sleep 2
    DSH_HUB_DATA="${DSH_HUB_DATA:-/data/dsh-hub}" \
    DSH_HUB_HOST="${DSH_HUB_HOST:-0.0.0.0}" \
    DSH_HUB_PORT="${DSH_HUB_PORT:-5000}" \
    DSH_HUB_DOMAIN="${DSH_HUB_DOMAIN:-hub.wuyajun.cn}" \
    nohup node --disable-warning=ExperimentalWarning src/index.ts > /var/log/dsh-hub.log 2>&1 &
fi

sleep 3
echo "=== 回滚完成 ==="
