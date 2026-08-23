#!/usr/bin/env bash
# DSH Hub 一键发布到 GitHub：
#   探测代理 → 检测认证（gh 或 GITHUB_TOKEN）→ 创建仓库（默认私有）→
#   配置 remote → 推送 main + 标签 → （有 gh 时）创建 GitHub Release
#
# 用法（二选一）：
#   GITHUB_USER=DreamRift GITHUB_TOKEN=ghp_xxx bash scripts/push-release.sh
#   GITHUB_USER=DreamRift bash scripts/push-release.sh     # 需本机 gh 已认证
# 可用环境变量：
#   REPO        仓库名（默认 dsh-hub）
#   PRIVATE     仓库私有（默认 true；false = 公开）
#   PROXY_PORT  代理 HTTP 端口（默认自动探测 7890/7897/10809/10808/1080/8888）
set -euo pipefail

REPO="${REPO:-dsh-hub}"
PRIVATE="${PRIVATE:-true}"
GH_USER="${GITHUB_USER:-}"
DESC="${DESC:-DSH Hub · DeepSeek Harness 多租户多实例管理器（单机 Linux，零依赖控制面）}"

log()  { printf '[push] %s\n' "$*"; }
fail() { printf '[push][错误] %s\n' "$*" >&2; exit 1; }

# ---------- 1) 网络与代理 ----------
if ! curl -sI --max-time 8 https://api.github.com >/dev/null 2>&1; then
  log "GitHub 直接不可达，尝试探测本地代理…"
  FOUND=""
  for p in "${PROXY_PORT:-}" 7890 7897 10809 10808 1080 8888 8118; do
    [ -z "$p" ] && continue
    if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/$p" 2>/dev/null; then FOUND="$p"; break; fi
  done
  [ -n "$FOUND" ] || fail "无法连通 GitHub，且未发现本地代理端口。请：1) 打开代理软件（TUN/混合/HTTP 模式）；2) 通过 PROXY_PORT 指定端口；或 3) 在可访问 GitHub 的机器上运行本脚本。"
  log "使用代理 http://127.0.0.1:$FOUND"
  export https_proxy="http://127.0.0.1:$FOUND" http_proxy="http://127.0.0.1:$FOUND"
  curl -sI --max-time 8 https://api.github.com >/dev/null 2>&1 || fail "代理生效但 GitHub 仍不可达"
fi
log "GitHub 可达 ✔"

# ---------- 2) 认证 ----------
AUTH=""
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  AUTH="gh"
  GH_USER="${GH_USER:-$(gh api user --jq .login 2>/dev/null || true)}"
elif [ -n "${GITHUB_TOKEN:-}" ]; then
  AUTH="token"
  [ -n "$GH_USER" ] || fail "设置 GITHUB_USER=<你的 GitHub 用户名>"
else
  fail "未找到认证：请安装并登录 gh（gh auth login），或提供 GITHUB_TOKEN（PAT，需 repo 权限）+ GITHUB_USER。"
fi
[ -n "$GH_USER" ] || fail "无法确定 GitHub 用户名（设置 GITHUB_USER）"
log "认证：$AUTH · 用户：$GH_USER"

# ---------- 3) 创建仓库（已存在则跳过） ----------
CREATE_CMD=()
if [ "$AUTH" = "gh" ]; then
  CREATE_CMD=(gh repo create "$GH_USER/$REPO" --description "$DESC" $( [ "$PRIVATE" = "true" ] && echo --private || echo --public ))
else
  CREATE_CMD=(curl -sS -X POST "https://api.github.com/user/repos" \
    -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
    -d "{\"name\":\"$REPO\",\"description\":\"$DESC\",\"private\":$([ "$PRIVATE" = "true" ] && echo true || echo false)}" -w '\nHTTP:%{http_code}')
fi
log "创建仓库 $GH_USER/$REPO（private=$PRIVATE）…"
OUT=$("${CREATE_CMD[@]}" 2>&1 || true)
if echo "$OUT" | grep -qE "HTTP:(200|201)" || echo "$OUT" | grep -qE "AlreadyExists|already exists"; then
  log "仓库就绪 ✔"
else
  log "创建返回：$(echo "$OUT" | tail -2 | head -1 || echo "$OUT" | head -1)"
  log "（若为 401/403 请检查 token 权限；若为 422 仓库可能已存在，继续推送即可）"
fi

# ---------- 4) remote + 推送 ----------
cd "$(dirname "$0")/../.." || fail "仓库根目录不存在"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/$GH_USER/$REPO.git"
else
  git remote add origin "https://github.com/$GH_USER/$REPO.git"
fi
log "推送到 origin（main + 全部标签）…"
if [ "$AUTH" = "token" ]; then
  git push -u "https://${GH_USER}:${GITHUB_TOKEN}@github.com/${GH_USER}/${REPO}.git" main --tags
else
  git push -u origin main --tags
fi
log "推送完成 ✔  https://github.com/$GH_USER/$REPO"

# ---------- 5) （可选）GitHub Release ----------
if [ "$AUTH" = "gh" ] && git tag -l v0.2.0 >/dev/null; then
  log "创建 GitHub Release v0.2.0…"
  gh release create v0.2.0 --repo "$GH_USER/$REPO" \
    --title "v0.2.0 · M2.1 安全修复与结构优化" \
    --notes "修复封禁失效/版本注入 RCE 等高危缺陷；M1 24/24 · M2 29/29 · 安全回归 38/38" || true
fi
log "全部完成 🎉"
