import type { IncomingMessage, ServerResponse } from 'node:http';
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
  
  const url = `http://${target.host}:${target.port}${targetPath}`;
  
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value && key.toLowerCase() !== 'host') {
      headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  }
  headers['X-Forwarded-For'] = req.socket.remoteAddress || 'unknown';
  headers['X-Forwarded-Proto'] = 'https';
  
  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await readBody(req) : undefined,
      redirect: 'manual',
    });
    
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });
    
    const body = await response.arrayBuffer();
    res.end(Buffer.from(body));
  } catch (err) {
    console.error('[proxy] HTTP proxy error:', err);
    res.statusCode = 502;
    res.end('Bad Gateway');
  }
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
    const hostHeader = `Host: ${target.host}:${target.port}\r\n`;
    
    let targetPath = req.url || '/';
    if (stripPrefix && targetPath.startsWith(stripPrefix)) {
      targetPath = targetPath.slice(stripPrefix.length) || '/';
      if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;
    }
    
    let requestLine = `${req.method} ${targetPath} HTTP/${req.httpVersion}\r\n`;
    
    let headers = '';
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() !== 'host') {
        const val = Array.isArray(value) ? value.join(', ') : value;
        if (val) headers += `${key}: ${val}\r\n`;
      }
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
