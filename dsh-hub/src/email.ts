/**
 * DSH Hub · 邮件发送模块
 *
 * 使用 Node.js 内置 net 模块实现 SMTP 发送（零依赖）。
 * 环境变量：
 *   SMTP_HOST - SMTP 服务器地址
 *   SMTP_PORT - SMTP 端口（默认 587）
 *   SMTP_USER - 发件人邮箱
 *   SMTP_PASS - 密码/授权码
 *   SMTP_FROM - 发件人显示名（可选）
 */
import * as net from 'node:net';
import * as tls from 'node:tls';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from?: string;
}

export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    user,
    pass,
    from: process.env.SMTP_FROM,
  };
}

function base64Encode(str: string): string {
  return Buffer.from(str).toString('base64');
}

function generateMessageId(): string {
  return `<${Date.now()}.${Math.random().toString(36).slice(2)}@dshhub.local>`;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const configOr = getSmtpConfig();
  if (!configOr) {
    throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables.');
  }
  const config = configOr; // TypeScript 控制流分析

  const from = config.from ? `${config.from} <${config.user}>` : config.user;
  const messageId = generateMessageId();

  return new Promise((resolve, reject) => {
    let socket: net.Socket | tls.TLSSocket;
    let buffer = '';
    let step = 0;

    const steps: Array<{ expect: number; send?: string }> = [
      { expect: 220 }, // 等待服务器就绪
      { expect: 250, send: `EHLO ${config.host}` }, // 问候
      { expect: 250, send: 'STARTTLS' }, // 升级到 TLS
    ];

    function writeLine(line: string) {
      socket.write(line + '\r\n');
    }

    function onData(data: Buffer) {
      buffer += data.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);
        const currentStep = steps[step];

        if (currentStep && code === currentStep.expect) {
          step++;
          if (currentStep.send) {
            writeLine(currentStep.send);
          }

          // STARTTLS 后需要升级连接
          if (currentStep.send === 'STARTTLS' && code === 220) {
            const tlsSocket = tls.connect({
              socket: socket as net.Socket,
              host: config.host,
              servername: config.host,
            });

            tlsSocket.on('secure', () => {
              socket = tlsSocket;
              buffer = '';
              step = 0;
              steps.length = 0;
              steps.push(
                { expect: 220 },
                { expect: 250, send: `EHLO ${config.host}` },
                { expect: 334, send: `AUTH LOGIN` },
                { expect: 334, send: base64Encode(config.user) },
                { expect: 235, send: base64Encode(config.pass) },
                { expect: 250, send: `MAIL FROM:<${config.user}>` },
                { expect: 250, send: `RCPT TO:<${to}>` },
                { expect: 354, send: 'DATA' },
                { expect: 250, send: buildMessage(from, to, subject, html, messageId) + '\r\n.' },
                { expect: 221, send: 'QUIT' },
              );
              // 等待 TLS 就绪后的 EHLO 响应
            });

            tlsSocket.on('error', reject);
            tlsSocket.on('data', onData);
            return;
          }

          // AUTH LOGIN 第一步
          if (currentStep.send === 'AUTH LOGIN' && code === 334) {
            // 等待 334 响应后发送用户名
          }

          // 完成
          if (currentStep.send === 'QUIT') {
            socket.end();
            resolve();
            return;
          }
        } else if (code >= 400) {
          socket.destroy();
          reject(new Error(`SMTP error: ${line}`));
          return;
        }
      }
    }

    // 连接
    if (config.port === 465) {
      // 直接 TLS
      socket = tls.connect({
        host: config.host,
        port: config.port,
        servername: config.host,
      });
      (socket as tls.TLSSocket).on('secure', () => {
        buffer = '';
        step = 0;
        steps.length = 0;
        steps.push(
          { expect: 220 },
          { expect: 250, send: `EHLO ${config.host}` },
          { expect: 334, send: 'AUTH LOGIN' },
          { expect: 334, send: base64Encode(config.user) },
          { expect: 235, send: base64Encode(config.pass) },
          { expect: 250, send: `MAIL FROM:<${config.user}>` },
          { expect: 250, send: `RCPT TO:<${to}>` },
          { expect: 354, send: 'DATA' },
          { expect: 250, send: buildMessage(from, to, subject, html, messageId) + '\r\n.' },
          { expect: 221, send: 'QUIT' },
        );
      });
    } else {
      socket = net.connect({ host: config.host, port: config.port });
    }

    socket.on('data', onData);
    socket.on('error', reject);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('SMTP timeout'));
    });
    socket.setTimeout(30000);
  });
}

function buildMessage(from: string, to: string, subject: string, html: string, messageId: string): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Encode(html),
  ];
  return lines.join('\r\n');
}

// ---------- 验证码相关 ----------

const RESET_CODE_TTL_MS = 10 * 60 * 1000; // 10 分钟

export function generateResetCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function createResetCode(db: import('node:sqlite').DatabaseSync, email: string): string {
  const code = generateResetCode();
  const expiresAt = Date.now() + RESET_CODE_TTL_MS;
  db.prepare('INSERT INTO password_reset_codes (email, code, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(email, code, expiresAt, Date.now());
  return code;
}

export function verifyResetCode(db: import('node:sqlite').DatabaseSync, email: string, code: string): boolean {
  const row = db.prepare(
    'SELECT id, expires_at FROM password_reset_codes WHERE email = ? AND code = ? AND used = 0 ORDER BY id DESC LIMIT 1'
  ).get(email, code) as { id: number; expires_at: number } | undefined;

  if (!row) return false;
  if (row.expires_at < Date.now()) return false;

  // 标记为已使用
  db.prepare('UPDATE password_reset_codes SET used = 1 WHERE id = ?').run(row.id);
  return true;
}

export function sendResetCodeEmail(email: string, code: string): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #f5f5f5; border-radius: 8px; padding: 24px;">
    <h2 style="color: #1a73e8; margin-top: 0;">DSH Hub 密码重置</h2>
    <p>您正在重置 DSH Hub 账户密码，验证码如下：</p>
    <div style="background: white; border-radius: 4px; padding: 16px; text-align: center; margin: 20px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a73e8;">${code}</span>
    </div>
    <p style="color: #666; font-size: 14px;">验证码 10 分钟内有效。如非本人操作，请忽略此邮件。</p>
  </div>
</body>
</html>
  `.trim();
  return sendEmail(email, 'DSH Hub 密码重置验证码', html);
}
