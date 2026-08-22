#!/usr/bin/env node
// S1 —— dsh web 绑 127.0.0.1，经零依赖 Node 反向代理访问：
//   1) 壳 HTML 经代理可达且注入 __DSH_BOOT__
//   2) 绝对路径资源经代理 200
//   3) WebSocket upgrade 经代理可完成握手（端点先静态扫描再探测）
// 结论打印为 [S1][PASS]/[S1][FAIL] 行，退出码 0/1。
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, openSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import crypto from 'node:crypto';

const DSH_PORT = Number(process.env.S1_DSH_PORT || 3971);
const PROXY_PORT = Number(process.env.S1_PROXY_PORT || 3972);
const HOST = '127.0.0.1';
const READY_MS = 90_000;

const results = [];
const record = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`[S1][${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};

function resolveDshBin() {
  const fromEnv = process.env.DSH_BIN;
  if (fromEnv && existsSync(fromEnv)) return [process.execPath, fromEnv];
  const guess = join(dirname(process.execPath), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (existsSync(guess)) return [process.execPath, guess];
  return ['dsh'];
}

function tryConnect(port, host = HOST) {
  return new Promise((resolve) => {
    const s = net.connect(port, host);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

async function waitReady(port, deadline) {
  while (Date.now() < deadline) {
    if (await tryConnect(port)) return true;
    await new Promise(r => setTimeout(r, 600));
  }
  return false;
}

function fetchViaProxy(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: HOST, port: PROXY_PORT, path }, (res) => {
      let body = '';
      res.on('data', c => { body += c; if (body.length > 4_000_000) res.destroy(); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

// ---- 零依赖反向代理（含 WS 隧道：原样转发请求行+头，然后双向裸管道）----
function startProxy(targetPort) {
  const server = http.createServer((req, res) => {
    const up = http.request({ host: HOST, port: targetPort, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
    });
    up.on('error', (e) => { res.writeHead(502); res.end('proxy upstream error: ' + e.message); });
    req.pipe(up);
  });
  server.on('upgrade', (req, socket, head) => {
    const up = net.connect(targetPort, HOST, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
      up.once('data', (chunk) => {
        const m = /^HTTP\/1\.[01] (\d{3})/.exec(String(chunk));
        console.log(`[S1][proxy] upgrade ${req.url} -> upstream ${m ? m[1] : '?'}`);
      });
    });
    socket.on('error', () => up.destroy());
    up.on('error', () => socket.destroy());
  });
  return new Promise((resolve) => server.listen(PROXY_PORT, HOST, () => resolve(server)));
}

// ---- 传输层探测（S2/S1 代码实证结论）：----
// 单次 RPC = HTTP POST /api/<method>（300MiB 上限，JSON 信封，桥接逐块流式响应）。
// 长连接事件流 = WebSocket upgrade 到 /api/events.mux 与 /api/events.host
// （dsh-client-connection lib/index.js：registerUpgrade + 426 Upgrade Required 拒绝普通 GET；
//  浏览器侧由注入的 __DSH_TRANSPORT__ 运行时 bundle 提供 WS 客户端）。
// SO：M3 网关需要 WS 隧道（原计划判断正确），S1 早前 WS 探测失败只因探错了路径。

// WebSocket 客户端握手探测（只验 101，不发帧）。
function wsProbe(port, path) {
  return new Promise((resolve) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      host: HOST, port, path, headers: {
        Connection: 'Upgrade', Upgrade: 'websocket',
        'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13'
      }
    });
    req.setTimeout(6000, () => { req.destroy(); resolve('timeout'); });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(101); });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', (e) => resolve('err:' + e.code));
    req.end();
  });
}

// 单次 RPC 调用探测：POST /api/host.describe，期望 200 + JSON 信封（验证 /api 围栏经代理放行）。
function rpcProbe(port, path) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      type: 'client-request', rpcId: 's1-' + crypto.randomBytes(8).toString('hex'),
      method: 'host.describe', payload: {}
    });
    const req = http.request({
      host: HOST, port, path, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
    });
    req.setTimeout(6000, () => { req.destroy(); resolve({ status: 'timeout', body: '' }); });
    req.on('response', (res) => {
      let data = '';
      res.on('data', (c) => { data += c; if (data.length > 2000) { req.destroy(); resolve({ status: res.statusCode, body: data.slice(0, 200) }); } });
      res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 300) }));
    });
    req.on('error', (e) => resolve({ status: 'err:' + e.code, body: '' }));
    req.end(body);
  });
}

// ================= 主流程 =================
const home = mkdtempSync(join(tmpdir(), 'dshhub-s1-'));
const logFd = openSync(join(home, '..', 'dshhub-s1-dsh.log'), 'a');
const [, binJs] = resolveDshBin();
console.log(`[S1] dsh bin: ${binJs}; DSH_HOME=${home}; ports dsh=${DSH_PORT} proxy=${PROXY_PORT}`);

const child = spawn(binJs, ['web', '--host', HOST, '--port', String(DSH_PORT), '--no-open'], {
  cwd: home,
  env: { ...process.env, DSH_HOME: home },
  stdio: ['ignore', logFd, logFd],
  detached: true,
});
let exitedEarly = null;
child.once('exit', (code, sig) => { exitedEarly = `code=${code} sig=${sig}`; });

try {
  const ready = await waitReady(DSH_PORT, Date.now() + READY_MS);
  if (!ready) throw new Error(`dsh web 未在 ${READY_MS}ms 内就绪${exitedEarly ? '（进程早退 ' + exitedEarly + '，日志见 spikes/.artifacts）' : ''}`);
  record('dsh web 就绪（独立 DSH_HOME + 独立端口）', true);

  await startProxy(DSH_PORT);

  const shell = await fetchViaProxy('/');
  record('壳 HTML 经代理 200', shell.status === 200, `status=${shell.status} bytes=${shell.body.length}`);
  record('__DSH_BOOT__ 注入保留', shell.body.includes('__DSH_BOOT__'));
  const assets = [...shell.body.matchAll(/(?:src|href)="(\/(?:assets|favicon[^"]*)\/[^"]+)"/g)].map(m => m[1]).slice(0, 5);
  let assetOk = 0;
  for (const a of assets) { const r = await fetchViaProxy(a); if (r.status === 200) assetOk++; else console.log('   asset fail:', a, r.status); }
  record(`绝对路径资源经代理可用（${assetOk}/${assets.length}）`, assets.length > 0 && assetOk === assets.length);

  // 事件流 = WS upgrade；单次调用 = POST /api/<method>。探测直连与经代理两条路。
  const streamPaths = ['/api/events.mux', '/api/events.host'];
  const directWs = [];
  for (const p of streamPaths) directWs.push([p, await wsProbe(DSH_PORT, p)]);
  console.log('[S1] 事件流直连:', directWs.map(([p, s]) => `${p}=>${s}`).join('  '));
  const proxyWs = [];
  for (const p of streamPaths) proxyWs.push([p, await wsProbe(PROXY_PORT, p)]);
  console.log('[S1] 事件流经代理:', proxyWs.map(([p, s]) => `${p}=>${s}`).join('  '));

  const directRpc = await rpcProbe(DSH_PORT, '/api/host.describe');
  const proxyRpc = await rpcProbe(PROXY_PORT, '/api/host.describe');
  console.log('[S1] 单次 RPC host.describe:', `直连=${JSON.stringify(directRpc.status)}  经代理=${JSON.stringify(proxyRpc.status)}`);

  const anyDirect101 = directWs.some(([, s]) => s === 101);
  const anyProxy101 = proxyWs.some(([, s]) => s === 101);
  record('存在可升级的 WS 事件流端点（直连 101）', anyDirect101, directWs.map(([p, s]) => `${p}=>${s}`).join(' '));
  record('WS 事件流经代理握手成功（网关 WS 隧道前提）', anyProxy101, proxyWs.map(([p, s]) => `${p}=>${s}`).join(' '));
  record('单次 RPC 经代理 200（/api 围栏放行）', Number(proxyRpc.status) === 200, `直连=${directRpc.status} 经代理=${proxyRpc.status}`);
} catch (e) {
  record('主流程', false, String(e.message ?? e));
} finally {
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 3000).unref();
  rmSync(home, { recursive: true, force: true });
}

const pass = results.every(Boolean);
console.log(pass ? '[S1] ===== 总结：全部通过 =====' : `[S1] ===== 总结：${results.filter(r => !r).length} 项失败 =====`);
process.exit(pass ? 0 : 1);
