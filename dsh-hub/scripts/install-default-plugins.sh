#!/bin/bash
# DSH 实例插件自动安装脚本
# 在实例创建后自动安装默认插件

set -e

# 默认插件列表
DEFAULT_PLUGINS=(
  "dsh-market"
  "dsh-better-sidebar"
  "dsh-im"
  "dsh-cost-meter"
  "dsh-visualize"
)

# DSH 二进制路径
DSH_BIN="${DSH_BIN:-dsh}"

# 安装插件函数
install_plugins() {
  local home_path="$1"
  local instance_id="$2"
  
  echo "[plugin-installer] Installing default plugins for instance ${instance_id}..."
  
  # 设置 DSH_HOME
  export DSH_HOME="${home_path}"
  
  # 安装每个插件
  for plugin in "${DEFAULT_PLUGINS[@]}"; do
    echo "[plugin-installer] Installing ${plugin}..."
    if ${DSH_BIN} install "${plugin}" 2>&1; then
      echo "[plugin-installer] ✅ ${plugin} installed successfully"
    else
      echo "[plugin-installer] ❌ Failed to install ${plugin}"
    fi
  done
  
  echo "[plugin-installer] Plugin installation completed for instance ${instance_id}"
}

# 如果提供了参数，直接安装
if [ $# -ge 2 ]; then
  install_plugins "$1" "$2"
else
  echo "Usage: $0 <home_path> <instance_id>"
  echo "Example: $0 /data/users/test/instances/i-abc123 i-abc123"
  exit 1
fi
