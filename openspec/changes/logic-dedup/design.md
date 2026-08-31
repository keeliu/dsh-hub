# Design: 页面与 API 重复逻辑统一

## 新增业务层函数

### auth.ts: `attemptLogin`

```typescript
export interface LoginResult {
  user: UserRow;
  token: string;
  csrf: string;
}

export function attemptLogin(
  db: DatabaseSync,
  account: string,
  password: string,
  ip: string | null,
  ua: string | null
): LoginResult {
  const key = loginLockKey(ip, account);
  checkLoginLock(key);

  const user = getUserByAccount(db, account);
  let valid = false;
  if (user) valid = verifyPassword(password, user.password_hash);
  else verifyPassword(password, DUMMY_HASH);

  if (!user || !valid) {
    recordLoginFailure(key);
    audit(db, 'login_failed', null, user?.id ?? null, `account=${account} ip=${ip}`);
    throw new HttpError(401, 'bad_credentials', 'invalid account or password');
  }
  if (user.status === 'disabled') throw new HttpError(403, 'disabled', 'account disabled');

  clearLoginLock(key);
  const session = createSession(db, user.id, ip, ua);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
  audit(db, 'login', user.id, user.id, `ip=${ip}`);

  return { user, ...session };
}
```

### users.ts: `disableUser`

```typescript
export async function disableUser(db: DatabaseSync, userId: number): Promise<void> {
  // 停实例（事务外，异步）
  for (const r of listRunningInstances(db, userId)) {
    await stopInstance(db, r);
  }
  withTx(db, () => {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('disabled', userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(Date.now(), userId);
  });
}
```

## pages.ts 改造

改造前后对比（以 POST /register 为例）：

```typescript
// ❌ 改造前：内联 SQL + 内联 slug/dir_name 生成
withTx(db, () => {
  const slug = nickname.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);
  db.prepare('INSERT INTO users ...').run(nickname, slug, nickname, ...);
  user = getUser(db, id.lastInsertRowid as number)!;
});

// ✅ 改造后：调用业务层函数
user = withTx(db, () => createUserRow(db, { nickname, password, role: 'user', email, username }));
```

## 改造清单

| pages.ts 中的重复代码 | 替换为 |
|---|---|
| POST /setup 内联 INSERT | `createUserRow()` |
| POST /register 内联 INSERT + slug | `createUserRow()` |
| POST /login 登录逻辑 | `attemptLogin()` |
| POST /admin/users 内联 INSERT | `createUserRow()` |
| POST /admin/users/:id/disable 停实例+吊销 | `disableUser()` |
| `process.env.DSH_HUB_COOKIE_SECURE` | `config.cookieSecure` |
| 注册后自动建实例 | `postRegisterActions()` |

## 不变更的部分

- API 路由（`api.ts`）的逻辑不变——它已经是正确的实现。
- 视图模板（`views/*`）不变。
- 业务层函数的签名和行为不变（只是从 pages/api 中抽取到业务层）。
