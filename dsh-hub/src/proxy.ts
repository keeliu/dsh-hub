import type { IncomingMessage, ServerResponse } from 'node:http';
import http from 'node:http';
import type { Socket } from 'node:net';

export interface ProxyTarget {
  host: string;
  port: number;
}

export async function proxyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  target: ProxyTarget,
  stripPrefix?: string
): Promise<void> {
  let targetPath = req.url || '/';
  if (stripPrefix && targetPath.startsWith(stripPrefix)) {
    targetPath = targetPath.slice(stripPrefix.length) || '/';
    if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase();
    // 剥离 host 和 origin（后续单独设置）
    if (value && lowerKey !== 'host' && lowerKey !== 'origin') {
      headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  }
  // 保留原始 Host 头（DSH 实例用 --trusted-host 校验）
  headers['host'] = req.headers.host || `${target.host}:${target.port}`;
  // 重写 Origin 头与 Host 一致（避免 DSH 实例 CORS/origin 校验失败）
  const hostForOrigin = req.headers.host || `${target.host}:${target.port}`;
  const protocol = headers['x-forwarded-proto'] || 'https';
  headers['origin'] = `${protocol}://${hostForOrigin}`;
  headers['X-Forwarded-For'] = req.socket.remoteAddress || 'unknown';
  headers['X-Forwarded-Proto'] = 'https';

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await readBody(req) : undefined;

  return new Promise((resolve, reject) => {
    const proxyReq = http.request({
      host: target.host,
      port: target.port,
      path: targetPath,
      method: req.method,
      headers,
    }, (proxyRes) => {
      res.statusCode = proxyRes.statusCode || 200;
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, value as string);
        }
      }
      proxyRes.pipe(res);
      proxyRes.on('end', () => resolve());
    });

    proxyReq.on('error', (err) => {
      console.error('[proxy] HTTP proxy error:', err);
      if (!res.headersSent) {
        res.statusCode = 502;
        res.end('Bad Gateway');
      } else {
        res.destroy();
      }
      resolve();
    });

    if (body) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
}

export async function proxyWebSocket(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  target: ProxyTarget,
  stripPrefix?: string
): Promise<void> {
  const net = await import('node:net');
  
  const upstream = net.createConnection(target.port, target.host);
  
  upstream.on('connect', () => {
    // 保留原始 Host 头（DSH 实例用 --trusted-host 校验）
    const originalHost = req.headers.host || `${target.host}:${target.port}`;
    const hostHeader = `Host: ${originalHost}\r\n`;
    
    let targetPath = req.url || '/';
    if (stripPrefix && targetPath.startsWith(stripPrefix)) {
      targetPath = targetPath.slice(stripPrefix.length) || '/';
      if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;
    }
    
    let requestLine = `${req.method} ${targetPath} HTTP/${req.httpVersion}\r\n`;
    
    let headers = '';
    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'host') continue;
      // 重写 Origin 头与 Host 一致（避免 DSH 实例 CORS/origin 校验失败）
      if (lowerKey === 'origin') {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        headers += `origin: ${protocol}://${originalHost}\r\n`;
        continue;
      }
      const val = Array.isArray(value) ? value.join(', ') : value;
      if (val) headers += `${key}: ${val}\r\n`;
    }
    headers += hostHeader;
    headers += '\r\n';
    
    upstream.write(requestLine + headers);
    if (head.length > 0) {
      upstream.write(head);
    }
  
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  
  upstream.on('error', (err) => {
    console.error('[proxy] WebSocket upstream error:', err);
    // 发送 WebSocket close frame (1011 Internal Error)
    const closeFrame = Buffer.alloc(2);
    closeFrame.writeUInt16BE(1011, 0);
    try { socket.write(closeFrame); } catch { /* ignore */ }
    socket.destroy();
  });
  
  socket.on('error', () => {
    upstream.destroy();
  });
  
  socket.on('close', () => {
    upstream.destroy();
  });
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
