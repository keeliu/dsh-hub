# M3: 鉴权网关实施清单

## 阶段一：基础设施

- [ ] 1.1 创建 `src/subdomain.ts`：子域名解析模块
  - [ ] 实现 `parseSubdomain(host, domain)` 函数
  - [ ] 实现 `isInstanceSubdomain(host, domain)` 判断函数
  - [ ] 添加单元测试

- [ ] 1.2 创建 `src/proxy.ts`：反向代理模块
  - [ ] 实现 `proxyHttpRequest(req, res, targetUrl)` HTTP 代理
  - [ ] 实现 `proxyWebSocket(req, socket, head, targetPort)` WebSocket 隧道
  - [ ] 处理连接错误和超时

- [ ] 1.3 更新 `src/config.ts`：添加域名配置
  - [ ] 读取 `DSH_HUB_DOMAIN` 环境变量
  - [ ] 默认值为 `dshhub.local`

## 阶段二：鉴权网关核心

- [ ] 2.1 创建 `src/gateway.ts`：网关核心逻辑
  - [ ] 实现 `handleGateway(req, res, ctx)` 主入口
  - [ ] 集成鉴权校验（session/token）
  - [ ] 实现所有权校验
  - [ ] 实例状态检查（running/stopped/starting）

- [ ] 2.2 实现引导页
  - [ ] 创建 `renderInstanceGuidePage(instance, user)` 视图函数
  - [ ] 实现"启动实例"按钮的 API 调用
  - [ ] 实现状态轮询逻辑

- [ ] 2.3 集成到 `src/index.ts`
  - [ ] 根据 Host 头判断请求类型
  - [ ] 子域名请求路由到网关
  - [ ] 其他请求走现有 API/UI

## 阶段三：自动实例创建

- [ ] 3.1 修改 `src/api.ts` 注册逻辑
  - [ ] 注册成功后自动创建实例
  - [ ] 自动启动实例
  - [ ] 返回实例访问地址

- [ ] 3.2 修改 `src/pages.ts` 注册页面
  - [ ] 注册成功后跳转到实例访问地址
  - [ ] 或展示"正在创建实例"的加载页

## 阶段四：配置与测试

- [ ] 4.1 更新环境变量配置
  - [ ] `DSH_HUB_DOMAIN` 改为 `hub.wuyajun.cn`
  - [ ] 更新 `.coze` 部署配置

- [ ] 4.2 类型检查
  - [ ] `npx tsc -p . --noEmit` 通过

- [ ] 4.3 冒烟测试
  - [ ] 测试子域名路由
  - [ ] 测试鉴权校验
  - [ ] 测试 WebSocket 隧道
  - [ ] 测试引导页
  - [ ] 测试自动实例创建

- [ ] 4.4 归档变更
  - [ ] 移动 `openspec/changes/m3-auth-gateway` 到 `archive/`
  - [ ] 合并规范到 `openspec/specs/`

## 依赖关系

```
1.1 → 2.1 → 2.3
1.2 → 2.1
1.3 → 2.1
2.2 → 2.3
2.3 → 3.1 → 3.2
3.2 → 4.1 → 4.2 → 4.3 → 4.4
```

## 预计工时

- 阶段一：2-3 小时
- 阶段二：3-4 小时
- 阶段三：1-2 小时
- 阶段四：1-2 小时
- **总计：7-11 小时**

## 风险点

1. **WebSocket 隧道**：需要处理双向数据流和连接管理，复杂度较高
2. **泛域名 SSL**：需要用户配置 Caddy/Nginx，部署环境可能有限制
3. **自动实例创建**：注册失败回滚逻辑需要仔细设计
4. **性能**：高并发代理可能成为瓶颈，需要压力测试

## 验收标准

1. 用户可以通过 `<slug>-<id>.hub.wuyajun.cn` 访问实例
2. 未登录用户被重定向到登录页
3. 用户只能访问自己的实例（管理员除外）
4. 实例未运行时展示引导页
5. WebSocket 连接正常工作
6. 用户注册后自动获得可用实例
7. 类型检查通过
8. 冒烟测试通过
