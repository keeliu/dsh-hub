#!/bin/bash
# DSH Hub CHANGELOG 非破坏性自动更新（每晚 2 点）
# 用法（cron 或手动）：
#   cron: 0 2 * * *  /data/dsh/home/projects/demo-git/dsh-hub/scripts/update-changelog.sh
# 说明：调用 update-changelog.mjs，只把"今天"的提交追加为新的 `## <日期>` 区块，
#       不重写/清空既有内容。
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "=== DSH Hub CHANGELOG 更新 [$(date '+%F %T')] ==="
node "$SCRIPT_DIR/update-changelog.mjs"
