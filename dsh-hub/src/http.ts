/**
 * DSH Hub · HTTP 基础设施（M2.1 拆分）
 *
 * HttpError / 响应序列化 / JSON body 读取 / cookie 解析 / 客户端 IP。
 * 原内联于 api.ts，拆出供 api.ts 与 auth.ts 共用（避免循环依赖）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.ts';

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

/** 发送 HTML 响应（Web UI 页面渲染用）。 */
export function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(html);
}

/** HTML 转义（防 XSS）。 */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 发送重定向响应。 */
export function redirect(res: ServerResponse, url: string, status = 302): void {
  res.writeHead(status, { location: url });
  res.end();
}

/** 读取表单数据（application/x-www-form-urlencoded）。 */
export function readForm(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new HttpError(413, 'payload_too_large', 'request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return; }
      const body = Buffer.concat(chunks).toString('utf8');
      const params = new URLSearchParams(body);
      const result: Record<string, string> = {};
      for (const [key, value] of params) result[key] = value;
      resolve(result);
    });
    req.on('error', reject);
  });
}

export function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof HttpError) {
    sendJson(res, err.status, { error: { code: err.code, message: err.message } });
    return;
  }
  console.error('[dsh-hub] unhandled:', err);
  sendJson(res, 500, { error: { code: 'internal', message: 'internal error' } });
}

/** 读取并解析 JSON body（上限 1MiB；Content-Type 非 JSON 也尝试解析，宽松处理）。 */
export function readJson(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new HttpError(413, 'payload_too_large', 'request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return; }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'bad_json', 'request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * 解析 Cookie 头。非法百分号编码的 cookie 值跳过（M2.1：此前 decodeURIComponent
 * 抛 URIError 会令整个请求 500）。
 */
export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
    } catch {
      /* 畸形编码的 cookie 视同不存在 */
    }
  }
  return out;
}

/**
 * 客户端 IP。仅当 DSH_HUB_TRUST_PROXY=1 时信任 X-Forwarded-For（首个条目），
 * 否则一律取 socket 对端地址——防止直连客户端伪造审计 IP（M2.1）。
 */
export function clientIp(req: IncomingMessage): string | null {
  if (config.trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return (fwd.split(',')[0] ?? '').trim() || null;
  }
  return req.socket.remoteAddress ?? null;
}
