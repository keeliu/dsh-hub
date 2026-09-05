#!/usr/bin/env node
/**
 * DSH Hub CHANGELOG 非破坏性自动更新
 *
 * 每天由 cron（或 daemon）触发，把"今天"的新增提交追加为一段 `## <日期>` 区块，
 * 插在现有区块之前（新的在上），并更新"最后更新"日期。不会重写/清空既有内容。
 *
 * 用法：node scripts/update-changelog.mjs
 * cron：0 2 * * *  cd /data/dsh/home/projects/demo-git/dsh-hub && node scripts/update-changelog.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectDir = join(here, '..');
const CHANGELOG = join(projectDir, 'CHANGELOG.md');

// 用系统 `date`（本机为 CST/UTC+8，即用户时区）取"今天"，与 CHANGELOG 日期一致；
// 避免直接用 new Date()（Node 走 /etc/localtime=UTC，会差 8 小时导致日期错位）。
function localDate() {
  try {
    return execFileSync('date', ['+%F'], { cwd: projectDir, encoding: 'utf8' }).trim();
  } catch {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}

const today = localDate();

function sh(cmd, args) {
  return execFileSync(cmd, args, { cwd: projectDir, encoding: 'utf8' });
}

function git(cmd, ...args) {
  try {
    return sh('git', [cmd, ...args]);
  } catch {
    return '';
  }
}

// 1. 今日提交（作者日期在今天）
const log = git('log', `--since=${today} 00:00:00`, `--until=${today} 23:59:59`, '--format=%s');
const commits = log.trim().split('\n').map((s) => s.trim()).filter(Boolean).map((s) => `- ${s}`);
if (commits.length === 0) {
  console.log(`[changelog] ${today} 暂无提交，跳过`);
  process.exit(0);
}

const text = readFileSync(CHANGELOG, 'utf8');

// 2. 若该日期区块已存在则不重复追加
if (text.includes(`## ${today}`)) {
  console.log(`[changelog] 已存在 ${today} 区块，跳过（不重复）`);
  process.exit(0);
}

// 3. 构造新区块（插到第一个已有 `## ` 区块之前，新的在上）
const block = `## ${today}\n\n${commits.join('\n')}\n\n`;
const head = text.indexOf('## ');
const updated = head === -1 ? text + '\n' + block : text.slice(0, head) + block + text.slice(head);

// 4. 更新"最后更新"日期
const finalText = updated.replace(/最后更新：\S+/g, `最后更新：${today}`);
writeFileSync(CHANGELOG, finalText);

// 5. 提交 + 推送
try {
  git('add', 'CHANGELOG.md');
  const commitMsg = `docs: 自动更新 CHANGELOG.md (${today})`;
  try {
    sh('git', ['commit', '-m', commitMsg]);
  } catch {
    console.log('[changelog] 无新提交（工作区无变化）');
  }
  try {
    sh('git', ['push', 'origin', 'main']);
    console.log(`[changelog] 已提交并推送（${today}，${commits.length} 条）`);
  } catch (e) {
    console.error('[changelog] 推送失败，仅本地提交：', String(e));
    process.exit(1);
  }
} catch (e) {
  console.error('[changelog] 更新失败：', String(e));
  process.exit(1);
}
