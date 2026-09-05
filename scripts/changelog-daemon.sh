#!/bin/bash
# DSH Hub CHANGELOG 每日调度（适用于没有 cron/systemd 的容器）
# 常驻循环：每天 02:00 触发一次 scripts/update-changelog.sh。
# 启动：nohup bash scripts/changelog-daemon.sh >/dev/null 2>&1 &
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[changelog-daemon] 启动，将于每天 02:00 更新 CHANGELOG [$(date '+%F %T')]"

LAST_RAN=""
while true; do
  NOW="$(date +%H:%M)"
  if [ "$NOW" = "02:00" ] && [ "$LAST_RAN" != "$(date +%F)" ]; then
    LAST_RAN="$(date +%F)"
    echo "[changelog-daemon] 触发更新 [$(date '+%F %T')]"
    bash "$SCRIPT_DIR/update-changelog.sh" || echo "[changelog-daemon] 本次更新失败"
  fi
  sleep 30
done
