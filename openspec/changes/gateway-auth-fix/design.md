# Design: 网关鉴权缺陷修复

## 变更概览

三个修复点，涉及两个文件，总改动量约 30 行。

## 修复 1：鉴权逻辑复用

`gateway.ts` 的 `authenticateRequest` 函数当前独立实现了 Bearer token 解析和 session cookie 解析。改为直接调用 `auth.ts` 的 `authenticate()`：

```typescript
// gateway.ts
import { authenticate } from './auth.ts';

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
```

这样 gateway 自动获得：
- 正确的 cookie 名称（`SESSION_COOKIE` 常量）
- `status=disabled` 校验
- Bearer token 前缀校验（`TOKEN_PREFIX`）
- 未来鉴权逻辑变更时自动同步

## 修复 2：身份标识校验

`subdomain.ts` 的 `verifyInstanceOwnership` 改为通过 `slug` 查找用户：

```typescript
export function verifyInstanceOwnership(
  db: DatabaseSync,
  info: PathInfo,
  userId: number,
  userRole: string
): InstanceRecord | null {
  const inst = getInstance(db, info.instanceId);
  if (!inst) return null;

  // 管理员/root 直接放行
  if (userRole === 'root' || userRole === 'admin') return inst;

  // 通过 user.id 校验归属，不再比较 dir_name
  if (inst.owner_id !== userId) return null;

  // 校验 URL 中的 slug 与实例属主的 slug 一致
  const user = getUser(db, inst.owner_id);
  if (!user || user.slug !== info.userSlug) return null;

  return inst;
}
```

## 修复 3：删除冗余代码

- 删除 `gateway.ts` 中的 `parseCookie` 函数（改用 `http.ts` 的 `parseCookies`）
- 删除 `gateway.ts` 中独立的 Bearer/session 解析逻辑
- 删除 `gateway.ts` 中对 `validateSession`、`resolveApiToken` 的直接引用

## 不变更的部分

- `parseInstancePath` / `buildInstancePath` / `buildInstanceUrl` 路径解析逻辑不变
- 代理转发逻辑（`proxyHttpRequest` / `proxyWebSocket`）不变
- LANDING_PAGE_HTML 不变
