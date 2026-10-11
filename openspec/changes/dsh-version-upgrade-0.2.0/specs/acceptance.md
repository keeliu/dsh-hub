# 验收规范：DSH 基线升级 0.1.5-rc.2 → 0.2.0-rc.2

## 场景 1：镜像基线正确且一致

- **Given** 在仓库根执行 `docker build -f dsh-hub/Dockerfile .`
- **When** 构建完成
- **Then** `docker run --rm --entrypoint dsh dsh-hub:latest --version` 输出 `0.2.0-rc.2`
- **And** `dsh-hub/Dockerfile` 两处 pin 完全相同（`grep '@deepseek-ai/dsh@' 只出现同一版本两次`）

## 场景 2：模板完整性三项校验

- **Given** template-builder 阶段完成
- **When** 执行构建期 `node -e` 校验
- **Then** 模板 `dependencies` 含 5 个默认插件（第 5 个是 `@nagi-ovo/dsh-visualize`）
- **And** 模板 `dsh.profile.bundles` 含 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app`
- **And** 这两个包存在于 `npm root -g/@deepseek-ai/dsh/node_modules/` 且 `version === dsh 版本`
- **And** 任一条件不满足时构建**失败**（非警告）

## 场景 3：官方 dsh-visualize 不再出现在默认清单

- **Given** 默认预置清单
- **When** `grep -rn '"dsh-visualize"' dsh-hub/src dsh-hub/Dockerfile`
- **Then** 只命中 `@nagi-ovo/dsh-visualize`，不存在裸 `dsh-visualize`
- **And** 清单第 5 项在 dsh 0.2.0-rc.2 上安装成功（本机复现：`+ @nagi-ovo/dsh-visualize ^0.1.4`）

## 场景 4：版本策略回归仍然拦截

- **Given** `settings.allowed_harness_versions = "0.2.1-alpha.2"`
- **When** 创建 `harness_version = "0.1.5-rc.2"` 的实例
- **Then** 请求被拒绝（不在白名单），且 `version-policy-regression.sh` 全绿
- **And** 非法 npm spec（如 `file:/etc`、`1.0.0; rm -rf /`）仍被 `SEMVER_RE` 拒绝

## 场景 5：版本树回归的 T3 语义未被削弱

- **Given** 镜像内置版本 `0.2.0-rc.2`
- **When** 创建 `harness_version = "0.1.5-rc.2"` 的实例并启动
- **Then** 走「非内置版本」路径：跳过模板、npx 装该版本树、用该版本启动（`version-tree-regression.sh` T3 全绿）
- **And** 该样本版本必须 ≠ 内置版本（否则测试退化，需修复）

## 场景 6：存量实例的可见行为（部署验收）

- **Given** 升级后的 hub 与一个仍写着旧 `harness_version` 的存量实例
- **When** 用户点「启动」
- **Then** 实例可正常启动（可能需一次 npx 装树，耗时较长但最终 `running`）
- **And** 把实例版本改为 `0.2.0-rc.2` 或清空后重启，走模板快路径（秒级启动）
