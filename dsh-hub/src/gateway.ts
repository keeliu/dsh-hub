import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import { parseInstancePath, verifyInstanceOwnership, buildInstanceUrl, type PathInfo } from './subdomain.ts';
import { proxyHttpRequest, proxyWebSocket, type ProxyTarget } from './proxy.ts';
import { authenticate } from './auth.ts';
import { config } from './config.ts';
import { getUser, type UserRow } from './users.ts';
import { listInstances } from './instances.ts';
import { hasActiveMembership } from './membership.ts';

// DSH 实例静态资源前缀（绝对路径，需要 fallback 代理）
const STATIC_ASSET_PREFIXES = ['/assets/', '/plugins/'];

const LANDING_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>实例未运行 - DSH Hub</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.container { text-align: center; padding: 2rem; max-width: 480px; }
h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #00d9ff; }
p { color: #aaa; margin-bottom: 1.5rem; line-height: 1.6; }
.status { display: inline-block; padding: 0.5rem 1rem; background: #2a2a4e; border-radius: 8px; margin-bottom: 1.5rem; }
.status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ff4444; margin-right: 8px; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
button { background: #00d9ff; color: #1a1a2e; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 1rem; cursor: pointer; font-weight: 600; transition: all 0.2s; }
button:hover { background: #00b8d4; transform: translateY(-1px); }
button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
.message { margin-top: 1rem; font-size: 0.9rem; color: #888; }
.error { color: #ff6b6b; }
.success { color: #4ecdc4; }
</style>
</head>
<body>
<div class="container">
<h1>DSH 实例未运行</h1>
<div class="status"><span class="status-dot"></span>实例已停止</div>
<p>你的 DeepSeek Harness 实例当前未运行，请返回控制台启动。</p>
<a href="/" style="display: inline-block; background: #00d9ff; color: #1a1a2e; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600;">返回控制台</a>
</div>
</body>
</html>`;

let db: DatabaseSync | null = null;

export function setGatewayDb(database: DatabaseSync): void {
  db = database;
}

export async function handleGatewayRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const pathname = (req.url || '/').split('?')[0] || '/';
  
  // 调试日志：记录所有进入网关的请求
  console.log(`[gateway] Request: ${req.method} ${pathname}`);
  
  // DSH deployment 配置：Hub 层直接提供（DSH 实例不返回此文件）
  if (pathname === '/dsh-deployment.js') {
    const referer = req.headers.referer || '';
    let apiBase = '';
    let wsBase = '';
    
    // 从 Referer 提取实例路径
    const refererPathname = new URL(referer, 'http://localhost').pathname;
    const instanceMatch = refererPathname.match(/^\/i\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?-(i-[0-9a-f]{8}))(?:\/|$)/);
    
    if (instanceMatch) {
      const instancePrefix = `/i/${instanceMatch[1]}`;
      apiBase = instancePrefix;
      wsBase = instancePrefix;
    }
    
    const js = `window.__DSH_DEPLOYMENT__ = {
  apiBase: '${apiBase}',
  wsBase: '${wsBase}',
  version: '0.1.0',
  features: {
    plugins: true,
    models: true,
    credentials: true,
    sessions: true,
    settings: true,
  },
};
`;
    
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    });
    res.end(js);
    return true;
  }
  
  // 静态资源 fallback：/assets/* 和 /plugins/* 代理到用户运行中的实例
  if (STATIC_ASSET_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return handleStaticAssetFallback(req, res, pathname);
  }
  
  const pathInfo = parseInstancePath(pathname);
  if (!pathInfo) {
    console.log(`[gateway] Not an instance path: ${pathname}`);
    return false;
  }
  
  if (!db) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service unavailable' }));
    return true;
  }
  
  const authResult = await authenticateRequest(req);
  if (!authResult.ok) {
    if (authResult.redirect) {
      const host = req.headers.host || config.hubDomain;
      const redirectUrl = `/login?redirect=${encodeURIComponent(`https://${host}${req.url}`)}`;
      res.writeHead(302, { Location: redirectUrl });
      res.end();
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
    }
    return true;
  }
  
  // 会员检查：管理员/root 跳过，普通用户需有效会员
  if (authResult.role !== 'admin' && authResult.role !== 'root') {
    if (!hasActiveMembership(db, authResult.userId!)) {
      res.writeHead(302, { Location: '/membership' });
      res.end();
      return true;
    }
  }
  
  const instance = verifyInstanceOwnership(db, pathInfo, authResult.userId!, authResult.role!);
  if (!instance) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Instance not found' }));
    return true;
  }
  
  if (instance.status !== 'running' || !instance.port) {
    if (req.headers.accept?.includes('text/html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(LANDING_PAGE_HTML);
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Instance not running' }));
    }
    return true;
  }
  
  const target: ProxyTarget = { host: '127.0.0.1', port: instance.port };
  const stripPrefix = `/i/${pathInfo.userSlug}-${pathInfo.instanceId}`;
  await proxyHttpRequest(req, res, target, stripPrefix);
  return true;
}

export async function handleGatewayWebSocket(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer
): Promise<boolean> {
  const pathname = (req.url || '/').split('?')[0] || '/';
  const pathInfo = parseInstancePath(pathname);
  if (!pathInfo) {
    return false;
  }
  
  if (!db) {
    socket.destroy();
    return true;
  }
  
  const authResult = await authenticateRequest(req);
  if (!authResult.ok) {
    socket.destroy();
    return true;
  }
  
  // 会员检查：管理员/root 跳过，普通用户需有效会员
  if (authResult.role !== 'admin' && authResult.role !== 'root') {
    if (!hasActiveMembership(db, authResult.userId!)) {
      socket.destroy();
      return true;
    }
  }
  
  const instance = verifyInstanceOwnership(db, pathInfo, authResult.userId!, authResult.role!);
  if (!instance || instance.status !== 'running' || !instance.port) {
    socket.destroy();
    return true;
  }
  
  const target: ProxyTarget = { host: '127.0.0.1', port: instance.port };
  const stripPrefix = `/i/${pathInfo.userSlug}-${pathInfo.instanceId}`;
  await proxyWebSocket(req, socket, head, target, stripPrefix);
  return true;
}

async function authenticateRequest(req: IncomingMessage): Promise<{
  ok: boolean;
  redirect?: boolean;
  userId?: number;
  role?: string;
}> {
  if (!db) return { ok: false };
  const auth = authenticate(db, req);
  if (!auth) return { ok: false, redirect: true };
  return { ok: true, userId: auth.user.id, role: auth.user.role };
}

/**
 * 静态资源 fallback：DSH 实例返回的 HTML 使用绝对路径引用 /assets/* 和 /plugins/*，
 * 这些请求不经过 /i/ 前缀，需要找到用户运行中的实例并代理。
 */
async function handleStaticAssetFallback(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!db) return false;
  
  const auth = authenticate(db, req);
  if (!auth) return false; // 未认证则不处理，让后续路由处理
  
  // 查找用户运行中的实例
  const instances = listInstances(db, auth.user.id);
  const running = instances.find(i => i.status === 'running' && i.port);
  if (!running || !running.port) return false; // 无运行中实例则不处理
  
  // 代理到实例（不 strip 前缀，因为 DSH 期望 /assets/ 路径）
  const target: ProxyTarget = { host: '127.0.0.1', port: running.port };
  await proxyHttpRequest(req, res, target);
  return true;
}

/**
 * DSH API fallback：DSH 实例的 JS 代码请求 /api/host.* 等绝对路径，
 * 这些请求直接发到 hub，需要代理到用户的 DSH 实例。
 */
export async function proxyToDshInstance(
  db: DatabaseSync,
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const auth = authenticate(db, req);
  if (!auth) {
    console.log(`[gateway] DSH API fallback: no auth for ${req.url}`);
    return false;
  }
  
  const instances = listInstances(db, auth.user.id);
  const running = instances.find(i => i.status === 'running' && i.port);
  if (!running || !running.port) {
    console.log(`[gateway] DSH API fallback: no running instance for user ${auth.user.id} (instances: ${instances.length})`);
    return false;
  }
  
  console.log(`[gateway] DSH API fallback: proxying ${req.method} ${req.url} to 127.0.0.1:${running.port} (instance ${running.id})`);
  const target: ProxyTarget = { host: '127.0.0.1', port: running.port };
  await proxyHttpRequest(req, res, target);
  return true;
}

/**
 * WebSocket fallback：DSH 前端通过绝对路径连接 /api/events.mux、/api/events.host 等
 * WebSocket 端点，不经过 /i/ 前缀。需要代理到用户运行中的 DSH 实例。
 */
export async function proxyWebSocketToDshInstance(
  database: DatabaseSync,
  req: IncomingMessage,
  socket: Socket,
  head: Buffer
): Promise<boolean> {
  const auth = authenticate(database, req);
  if (!auth) {
    console.log(`[gateway] WebSocket fallback: no auth for ${req.url}`);
    return false;
  }
  
  const instances = listInstances(database, auth.user.id);
  const running = instances.find(i => i.status === 'running' && i.port);
  if (!running || !running.port) {
    console.log(`[gateway] WebSocket fallback: no running instance for user ${auth.user.id}`);
    return false;
  }
  
  console.log(`[gateway] WebSocket fallback: proxying ${req.url} to 127.0.0.1:${running.port}`);
  const target: ProxyTarget = { host: '127.0.0.1', port: running.port };
  await proxyWebSocket(req, socket, head, target);
  return true;
}
