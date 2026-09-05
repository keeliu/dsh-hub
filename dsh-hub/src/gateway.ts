import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import { parseInstancePath, verifyInstanceOwnership, buildInstanceUrl, type PathInfo } from './subdomain.ts';
import { proxyHttpRequest, proxyWebSocket, type ProxyTarget } from './proxy.ts';
import { authenticate } from './auth.ts';
import { parseCookies } from './http.ts';
import { CSRF_COOKIE } from './sessions.ts';
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
  
  // Workspace 请求处理
  if (pathname.startsWith(WORKSPACE_PREFIX)) {
    if (pathname === WORKSPACE_PREFIX) {
      return handleWorkspaceEntry(db!, req, res);
    } else {
      return handleWorkspaceProxy(db!, req, res, pathname);
    }
  }
  
  // DSH deployment 配置：Hub 层直接提供（DSH 实例不返回此文件）
  if (pathname === '/dsh-deployment.js') {
    const referer = req.headers.referer || '';
    let apiBase = '';
    let wsBase = '';
    
    console.log(`[gateway] dsh-deployment.js request, Referer: "${referer}"`);
    
    // 从 Referer 提取实例路径
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const refererPathname = refererUrl.pathname;
        console.log(`[gateway] dsh-deployment.js Referer pathname: "${refererPathname}"`);
        
        const instanceMatch = refererPathname.match(/^\/i\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?-(i-[0-9a-f]{8}))(?:\/|$)/);
        console.log(`[gateway] dsh-deployment.js instanceMatch:`, instanceMatch);
        
        if (instanceMatch) {
          const instancePrefix = `/i/${instanceMatch[1]}`;
          apiBase = instancePrefix;
          wsBase = instancePrefix;
          console.log(`[gateway] dsh-deployment.js apiBase: "${apiBase}"`);
        }
      } catch (err) {
        console.error(`[gateway] dsh-deployment.js Referer parse error:`, err);
      }
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
  
  // DSH 插件 API fallback：/i/<plugin-name>/* 格式（不符合实例路径规范）
  // 例如：/i/dsh-market/registry → 代理到用户运行中的实例
  if (pathname.startsWith('/i/') && !pathname.match(/^\/i\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-(i-[0-9a-f]{8})(?:\/|$)/)) {
    console.log(`[gateway] Plugin API fallback: ${pathname}`);
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
  
  // 代理到实例
  // 对于 /i/<plugin>/* 格式，strip /i 前缀，变成 /<plugin>/*
  // 对于 /assets/* 和 /plugins/*，不 strip 前缀
  const target: ProxyTarget = { host: '127.0.0.1', port: running.port };
  let stripPrefix: string | undefined;
  
  if (pathname.startsWith('/i/') && !pathname.match(/^\/i\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-(i-[0-9a-f]{8})(?:\/|$)/)) {
    // /i/dsh-market/registry → /dsh-market/registry
    stripPrefix = '/i';
  }
  
  await proxyHttpRequest(req, res, target, stripPrefix);
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

// ============================================================
// Workspace 直接嵌入
// ============================================================

const WORKSPACE_PREFIX = '/workspace';

// HTML 中需要重写路径的标签属性
const HTML_PATH_ATTRS = [
  { tag: 'script', attr: 'src' },
  { tag: 'link', attr: 'href' },
  { tag: 'img', attr: 'src' },
  { tag: 'video', attr: 'src' },
  { tag: 'source', attr: 'src' },
];

/**
 * 重写 HTML 响应体中的绝对路径
 * /assets/main.js → /workspace/assets/main.js
 * 不重写外部 URL、相对路径、data URI
 */
function rewriteHtmlPaths(html: string, prefix: string): string {
  let result = html;
  for (const { tag, attr } of HTML_PATH_ATTRS) {
    // 匹配 <tag attr="/..."> 或 <tag attr='/...'>
    const regex = new RegExp(
      `(<${tag}[^>]*${attr}=["'])(/(?!/|data:|\\.\\.)[^"']*["'])`,
      'gi'
    );
    result = result.replace(regex, `$1${prefix}$2`.replace('$2', '$2').replace('$1', '$1'));
    // 更简单的实现
    result = result.replace(
      new RegExp(`(<${tag}[^>]*${attr}=["'])(/[^"']+["'])`, 'gi'),
      (match, open, path) => {
        // 不重写外部 URL、相对路径、data URI
        if (path.startsWith('"/') && !path.startsWith('"//') && !path.startsWith('"data:')) {
          return `${open}${prefix}${path.slice(1)}`;
        }
        return match;
      }
    );
  }
  return result;
}

/**
 * 重写 CSS 响应体中的 url() 路径
 * url(/assets/font.woff) → url(/workspace/assets/font.woff)
 */
function rewriteCssPaths(css: string, prefix: string): string {
  return css.replace(
    /url\((["']?)(\/[^)"']+)\1\)/g,
    (match, quote, path) => {
      // 不重写外部 URL、相对路径、data URI
      if (path.startsWith('/') && !path.startsWith('//') && !path.startsWith('data:')) {
        return `url(${quote}${prefix}${path}${quote})`;
      }
      return match;
    }
  );
}

/**
 * 注入 __DSH_DEPLOYMENT__ 配置和导航栏
 * 在 <head> 中插入 <script>window.__DSH_DEPLOYMENT__ = {...}</script>
 * 在 <body> 开头插入导航栏
 */
function injectDeploymentConfig(html: string, prefix: string, user?: { nickname: string; slug: string }): string {
  // 注入 __DSH_DEPLOYMENT__ 配置
  const configScript = `<script>window.__DSH_DEPLOYMENT__ = { apiBase: '${prefix}', wsBase: '${prefix}' };</script>`;
  let result = html.replace('<head>', `<head>${configScript}`);
  
  // 注入导航栏样式
  const navStyle = `
<style>
#dsh-hub-navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: #1a1a1a;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
#dsh-hub-navbar .brand {
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
  text-decoration: none;
}
#dsh-hub-navbar .nav-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}
#dsh-hub-navbar .user-menu {
  position: relative;
}
#dsh-hub-navbar .user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #0066cc;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.9rem;
}
#dsh-hub-navbar .dropdown-menu {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 160px;
  overflow: hidden;
  z-index: 101;
}
#dsh-hub-navbar .dropdown-menu.show {
  display: block;
}
#dsh-hub-navbar .dropdown-item {
  display: block;
  padding: 0.75rem 1rem;
  color: #1a1a1a !important;
  text-decoration: none;
  font-size: 0.9rem;
  transition: background 0.2s;
}
#dsh-hub-navbar .dropdown-item:hover {
  background: #f5f5f5;
  color: #1a1a1a !important;
}
#dsh-hub-navbar .dropdown-divider {
  height: 1px;
  background: #e5e5e5;
  margin: 0;
}
#dsh-hub-navbar .dropdown-item-danger {
  color: var(--danger, #dc3545) !important;
}
#dsh-hub-navbar .workspace-content {
  margin-top: 60px;
  height: calc(100vh - 60px);
  overflow: hidden;
}
</style>
<script>
// 点击外部关闭下拉菜单
document.addEventListener('click', function(e) {
  var menu = document.getElementById('user-dropdown');
  if (menu && !e.target.closest('.user-menu')) {
    menu.classList.remove('show');
  }
});
</script>`;
  result = result.replace('</head>', `${navStyle}</head>`);
  
  // 注入导航栏 HTML
  if (user) {
    const initial = user.nickname.charAt(0).toUpperCase();
    const navHtml = `
<div id="dsh-hub-navbar">
  <a href="/" class="brand">乌鸦 work</a>
  <div class="nav-right">
    <div class="user-menu">
      <div class="user-avatar" onclick="document.getElementById('user-dropdown').classList.toggle('show')">${initial}</div>
      <div id="user-dropdown" class="dropdown-menu">
        <a href="/profile" class="dropdown-item">个人中心</a>
        <a href="/instances" class="dropdown-item">实例管理</a>
        <div class="dropdown-divider"></div>
        <form method="POST" action="/api/auth/logout" style="margin:0">
          <button type="submit" class="dropdown-item dropdown-item-danger" style="width:100%;text-align:left">退出系统</button>
        </form>
      </div>
    </div>
  </div>
</div>
<style>
html, body {
  height: 100%;
  overflow: hidden;
  margin: 0;
  padding: 0;
}
body {
  margin-top: 60px !important;
  height: calc(100vh - 60px) !important;
  overflow-y: auto !important;
}
</style>`;
    result = result.replace('<body>', `<body>${navHtml}`);
  }
  
  return result;
}

/**
 * Workspace 入口处理
 * GET /workspace → 返回重写后的 index.html
 */
export async function handleWorkspaceEntry(
  database: DatabaseSync,
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // 1. 认证检查
  const auth = authenticate(database, req);
  if (!auth) {
    res.writeHead(302, { Location: '/login' });
    res.end();
    return true;
  }

  // 2. 会员检查
  if (!hasActiveMembership(database, auth.user.id)) {
    res.writeHead(302, { Location: '/membership' });
    res.end();
    return true;
  }

  // 3. 查找 running 实例
  const instances = listInstances(database, auth.user.id);
  const running = instances.find(i => i.status === 'running' && i.port);

  if (!running || !running.port) {
    // 无 running 实例，返回 loading 页面
    const cookies = parseCookies(req);
    const csrfToken = cookies[CSRF_COOKIE] || '';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="${csrfToken}">
<title>Workspace - DSH Hub</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.container { text-align: center; padding: 2rem; }
h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #00d9ff; }
p { color: #aaa; margin-bottom: 1.5rem; }
.loading { display: inline-block; width: 40px; height: 40px; border: 4px solid #2a2a4e; border-top-color: #00d9ff; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="container">
<h1>正在启动 Workspace...</h1>
<div class="loading"></div>
<p>正在准备你的工作环境</p>
</div>
<script>
// 轮询实例状态
async function pollStatus() {
  try {
    const res = await fetch('/api/instances');
    const data = await res.json();
    const running = data.instances?.find(i => i.status === 'running');
    if (running) {
      window.location.reload();
    } else {
      // 尝试启动实例
      const instances = data.instances || [];
      const stopped = instances.find(i => i.status === 'stopped' || i.status === 'failed');
      if (stopped) {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        await fetch('/api/instances/' + stopped.id + '/start', {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrfToken || '' }
        });
      }
      setTimeout(pollStatus, 2000);
    }
  } catch (e) {
    setTimeout(pollStatus, 2000);
  }
}
pollStatus();
</script>
</body>
</html>`);
    return true;
  }

  // 4. 获取实例的 index.html
  try {
    const target: ProxyTarget = { host: '127.0.0.1', port: running.port };
    const response = await fetch(`http://${target.host}:${target.port}/`);
    let html = await response.text();

    // 5. 重写 HTML 中所有资源路径
    html = rewriteHtmlPaths(html, WORKSPACE_PREFIX);

    // 6. 注入 __DSH_DEPLOYMENT__ 配置和导航栏
    html = injectDeploymentConfig(html, WORKSPACE_PREFIX, auth.user);

    // 7. 返回修改后的 HTML
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    });
    res.end(html);
    return true;
  } catch (err) {
    console.error(`[gateway] Workspace entry error:`, err);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'workspace_error', message: 'Failed to load workspace' } }));
    return true;
  }
}

/**
 * Workspace 通配代理
 * GET /workspace/* → 去掉前缀 → 代理到实例 → 重写响应体
 */
export async function handleWorkspaceProxy(
  database: DatabaseSync,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // 1. 认证检查
  const auth = authenticate(database, req);
  if (!auth) {
    res.writeHead(302, { Location: '/login' });
    res.end();
    return true;
  }

  // 2. 会员检查
  if (!hasActiveMembership(database, auth.user.id)) {
    res.writeHead(302, { Location: '/membership' });
    res.end();
    return true;
  }

  // 3. 查找 running 实例
  const instances = listInstances(database, auth.user.id);
  const running = instances.find(i => i.status === 'running' && i.port);
  if (!running || !running.port) {
    res.writeHead(302, { Location: '/workspace' });
    res.end();
    return true;
  }

  // 4. 去掉 /workspace 前缀
  const targetPath = pathname.slice(WORKSPACE_PREFIX.length) || '/';

  // 5. 代理到实例
  try {
    const target: ProxyTarget = { host: '127.0.0.1', port: running.port };
    const response = await fetch(`http://${target.host}:${target.port}${targetPath}`);
    const contentType = response.headers.get('content-type') || '';

    // 6. 根据 Content-Type 决定是否重写响应体
    if (contentType.includes('text/html')) {
      let html = await response.text();
      html = rewriteHtmlPaths(html, WORKSPACE_PREFIX);
      html = injectDeploymentConfig(html, WORKSPACE_PREFIX);
      res.writeHead(response.status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      });
      res.end(html);
    } else if (contentType.includes('text/css')) {
      let css = await response.text();
      css = rewriteCssPaths(css, WORKSPACE_PREFIX);
      res.writeHead(response.status, {
        'Content-Type': contentType,
      });
      res.end(css);
    } else {
      // 其他类型（JS、图片等）直接转发
      const buffer = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, {
        'Content-Type': contentType,
      });
      res.end(buffer);
    }
    return true;
  } catch (err) {
    console.error(`[gateway] Workspace proxy error for ${pathname}:`, err);
    // SPA fallback：返回重写后的 index.html
    return await handleWorkspaceEntry(database, req, res);
  }
}
