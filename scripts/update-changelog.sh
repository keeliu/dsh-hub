#!/bin/bash
# DSH Hub CHANGELOG 自动更新脚本
# 使用方法: bash scripts/update-changelog.sh
# 定时任务: 0 3 * * * /path/to/scripts/update-changelog.sh

set -e

echo "=== DSH Hub CHANGELOG 自动更新 ==="
echo "时间: $(date)"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 进入项目目录
cd "$PROJECT_DIR"

# 生成 CHANGELOG.md
echo "生成 CHANGELOG.md..."

cat > CHANGELOG.md << 'HEADER'
# DSH Hub 系统迭代记录

> 本文档记录 DSH Hub 项目的所有功能迭代和修复，按日期倒序排列。
> 最后更新：
HEADER

# 添加最后更新时间
echo "$(date +%Y-%m-%d)" >> CHANGELOG.md

cat >> CHANGELOG.md << 'SEPARATOR'

---

SEPARATOR

# 获取所有提交记录，按日期分组
git log --format="%ad %s" --date=short | awk '{
  date = $1
  msg = substr($0, length(date) + 2)
  if (date != prev_date) {
    if (prev_date != "") print ""
    print "## " date
    print ""
    prev_date = date
  }
  print "- " msg
}' >> CHANGELOG.md

cat >> CHANGELOG.md << 'FOOTER'

---

## 技术栈

- **语言**: TypeScript（Node.js ≥ 24）
- **运行时依赖**: 零（仅使用 Node.js 内置模块）
- **数据库**: SQLite（node:sqlite）
- **包管理**: pnpm
- **部署**: Docker + OpenResty

---

## 项目结构

```
/workspace/projects/
├── .coze                    # 平台配置
├── AGENTS.md                # 项目规范与经验
├── CHANGELOG.md             # 系统迭代记录（本文档）
── README.md                # 项目说明
├── docs/                    # 调研笔记 / 开发计划 / 进展日志
├── openspec/                # OpenSpec 规范驱动开发
│   ├── specs/               # 已实现的功能规范
│   └── changes/             # 待实现/已归档的变更提案
└── dsh-hub/                 # 控制面实现（主代码目录）
    ├── src/                 # TypeScript 源码
    ├── scripts/             # 冒烟测试与运维脚本
    ├── Dockerfile           # Docker 镜像构建
    ├── docker-compose.yml   # Docker 编排配置
    └── package.json
```

---

## 关键模块

- **入口**: `dsh-hub/src/index.ts`
- **配置**: `dsh-hub/src/config.ts`
- **数据库**: `dsh-hub/src/db.ts`
- **HTTP 服务器**: `dsh-hub/src/http.ts`
- **API 路由**: `dsh-hub/src/api.ts`
- **页面路由**: `dsh-hub/src/pages.ts`
- **认证**: `dsh-hub/src/auth.ts`
- **会话管理**: `dsh-hub/src/sessions.ts`
- **用户管理**: `dsh-hub/src/users.ts`
- **实例管理**: `dsh-hub/src/instances.ts`
- **进程监管**: `dsh-hub/src/supervisor/`
- **HTTP/WS 代理**: `dsh-hub/src/proxy.ts`
- **鉴权网关**: `dsh-hub/src/gateway.ts`
- **会员系统**: `dsh-hub/src/membership.ts`
- **支付集成**: `dsh-hub/src/payment.ts`
- **定时任务**: `dsh-hub/src/scheduler.ts`
- **页面视图**: `dsh-hub/src/views/`

---

## 部署架构

```
用户浏览器
    ↓
OpenResty (反向代理)
    ↓
dsh-hub (Node.js, 端口 3082)
    ↓
DSH 实例 (端口 4001-4999)
```

**数据持久化**: `/data/dsh-hub` (bind mount)

**网络配置**: 
- dsh-hub: 172.18.0.100 (静态 IP)
- 网络：1panel-network

---

## 开发规范

- **OpenSpec 规范驱动开发**: 先写规范，再写代码
- **运行时零依赖原则**: 不引入运行时 npm 依赖
- **Node.js ≥ 24**: 使用原生模块
- **pnpm**: 包管理工具
- **TypeScript**: 类型安全

---

## 维护说明

- 本文档由系统自动生成，每天凌晨 3 点更新
- 更新内容基于 git 提交历史
- 如需修改文档格式或内容，请联系管理员
FOOTER

# 提交更新
echo "提交 CHANGELOG.md 更新..."
git add CHANGELOG.md
git commit -m "docs: 自动更新 CHANGELOG.md ($(date +%Y-%m-%d))" || echo "无更新"

# 推送到远程
echo "推送到远程仓库..."
git push origin main

echo "=== CHANGELOG 更新完成 ==="
