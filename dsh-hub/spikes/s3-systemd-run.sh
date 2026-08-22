#!/usr/bin/env bash
# S3 —— systemd-run 资源限额可行性探测（MemoryMax / CPUQuota / PidsLimit / --uid）
# 目的（调研 §5.3）：非特权服务账号能否 `systemd-run --scope --uid=` 给实例设内存/CPU/PID 限额。
# 探测路径：
#   1) systemd 是否在运行（transient scope 的前提）
#   2) 当前用户无交互鉴权下 `systemd-run --scope --property=...` 能否建 scope
#   3) 限额是否可读回（systemctl show + cgroup v2 文件）
#   4) --uid 变体（严格模式每用户独立 uid 的运行前提）
#   5) 兜底数据点：cgroup v2 user 子树是否可直接写（M5 降级方案的可行性）
# 结论打印为 [S3][PASS]/[S3][FAIL]/[S3][INFO] 行；总体退出码 0=全部通过 / >0=存在失败项。
set -u

UNIT="dshhub-s3-$$"
OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

pass=0; fail=0
record() {
  case "$1" in
    PASS) pass=$((pass + 1)) ;;
    FAIL) fail=$((fail + 1)) ;;
  esac
  echo "[S3][$1] $2${3:+ — $3}"
}

# ---- 1) systemd 运行态 ----
if [ -d /run/systemd/system ]; then
  SYS_RUN="$(systemctl is-system-running 2>/dev/null || echo unknown)"
  record INFO "systemd 运行态: /run/systemd/system 存在, is-system-running=$SYS_RUN"
  SYSTEMD_OK=1
else
  record INFO "systemd 未运行（无 /run/systemd/system）"
  SYSTEMD_OK=0
fi

# ---- 2/3) 非特权 transient scope（本用户）----
if [ "$SYSTEMD_OK" = 1 ]; then
  # 注：systemd-run 的 PID 限额属性名是 TasksMax（cgroup v2 pids 控制器），
  # PidsLimit 是 cgroupfs 属性名，systemd-run 不认识它（S3 首跑已证实）。
  systemd-run --scope --unit="$UNIT" \
    --property=MemoryMax=64M --property=CPUQuota=50% --property=TasksMax=64 \
    -- sleep 5 >"$OUT" 2>&1 &
  RUN_PID=$!
  sleep 3
  if kill -0 "$RUN_PID" 2>/dev/null && ! grep -qi "access denied\|not permitted\|operation failed" "$OUT"; then
    record PASS "systemd-run --scope 建 scope 成功（unprivileged）"
    LIMITS="$(systemctl show "$UNIT" -p MemoryMax -p CPUQuotaPeriodUSec -p CPUQuotaScale -p TasksMax 2>/dev/null | tr '\n' ' ')"
    record INFO "回读限额: ${LIMITS:-<systemctl show 无输出>}"
    if echo "$LIMITS" | grep -q "MemoryMax=67108864"; then
      record PASS "MemoryMax=64M 已生效并可读回"
    else
      record FAIL "MemoryMax 未按预期生效"
    fi
    wait "$RUN_PID" 2>/dev/null
    systemctl reset-failed "$UNIT" 2>/dev/null
  else
    MSG="$(tr '\n' ' ' < "$OUT" | cut -c1-300)"
    record FAIL "systemd-run --scope 非特权不可用" "${MSG:-无输出}"
  fi
else
  record FAIL "systemd 不在运行，transient scope 不可用"
fi

# ---- 4) --uid 变体（严格模式前提）----
if [ "$SYSTEMD_OK" = 1 ]; then
  if systemd-run --scope --uid="$(id -u)" --unit="$UNIT-uid" --property=MemoryMax=64M -- sleep 4 >"$OUT" 2>&1; then
    record PASS "systemd-run --uid 可用（当前 uid 无降权场景，仅探能力）"
  else
    MSG="$(tr '\n' ' ' < "$OUT" | cut -c1-300)"
    record FAIL "systemd-run --uid 不可用" "${MSG:-无输出}"
  fi
  systemctl reset-failed "$UNIT-uid" 2>/dev/null
fi

# ---- 5) 兜底数据点：cgroup v2 user 子树可写性 ----
CGRP_ROOT="/sys/fs/cgroup"
if [ -d "$CGRP_ROOT" ]; then
  TESTCG="$CGRP_ROOT/user.slice/user-$(id -u).slice/dshhub-s3-$$"
  if mkdir "$TESTCG" 2>/dev/null; then
    if echo 32M > "$TESTCG/memory.max" 2>/dev/null; then
      MB="$(cat "$TESTCG/memory.max" 2>/dev/null || echo ?)"
      record PASS "cgroup v2 user 子树可直接写（memory.max=$MB）→ M5 降级方案可行"
    else
      record INFO "user 子树可建 cgroup，但 memory.max 不可写"
    fi
    rmdir "$TESTCG" 2>/dev/null
  else
    record INFO "user 子树不可建 cgroup（M5 需 systemd 可用路径或提升权限）"
  fi
else
  record INFO "无 /sys/fs/cgroup（非 cgroup v2 环境）"
fi

# ---- 总结 ----
if [ "$fail" -gt 0 ]; then
  echo "[S3] ===== 总结：$fail 项失败 ====="
  exit 1
else
  echo "[S3] ===== 总结：PASS=$pass FAIL=$fail（失败 0 项）====="
  exit 0
fi