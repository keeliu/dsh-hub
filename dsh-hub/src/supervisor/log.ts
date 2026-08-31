import { closeSync, existsSync, openSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { InstanceRecord } from './index.ts';
import { LOG_ROTATE_BYTES } from './index.ts';

export function instanceLogDir(record: Pick<InstanceRecord, 'home_path'>): string {
  return join(dirname(record.home_path), 'logs');
}

export function writeFailureSnapshot(record: Pick<InstanceRecord, 'home_path' | 'id'>, title: string, detail: string): void {
  const logDir = instanceLogDir(record);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(logDir, `start-fail-${ts}.md`), `# 启动失败快照\n\n- 实例: ${record.id}\n- 时间: ${new Date().toISOString()}\n- 原因: ${title}\n\n\`\`\`\n${detail.slice(0, 4000)}\n\`\`\`\n`);
}

/** web.out.log 超阈值轮转：.log → .log.1 → .log.2（B8）。 */
export function rotateLog(logPath: string, maxBytes = LOG_ROTATE_BYTES): void {
  try {
    if (!existsSync(logPath) || statSync(logPath).size <= maxBytes) return;
    const bak1 = `${logPath}.1`;
    const bak2 = `${logPath}.2`;
    rmSync(bak2, { force: true });
    if (existsSync(bak1)) renameSync(bak1, bak2);
    renameSync(logPath, bak1);
  } catch { /* 轮转失败不阻塞启动 */ }
}

/** 日志尾部读取（B8）：只读文件末尾 ≤64KiB，不再整文件读入内存。 */
export function tailLog(record: Pick<InstanceRecord, 'home_path'>, tail = 200): string {
  const logPath = join(instanceLogDir(record), 'web.out.log');
  const READ_BACK = 64 * 1024;
  try {
    const size = statSync(logPath).size;
    const offset = Math.max(0, size - READ_BACK);
    const fd = openSync(logPath, 'r');
    try {
      const buf = Buffer.alloc(size - offset);
      let pos = 0;
      while (pos < buf.length) {
        const n = readSync(fd, buf, pos, buf.length - pos, offset + pos);
        if (n <= 0) break;
        pos += n;
      }
      const lines = buf.toString('utf8').split('\n');
      return lines.slice(-tail).join('\n');
    } finally {
      closeSync(fd);
    }
  } catch {
    return '(no log yet)';
  }
}
