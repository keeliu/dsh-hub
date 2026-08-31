# Tasks: 页面表单 CSRF 保护

## 阶段 1：基础设施

- [ ] 1.1 `views/layout.ts` 新增 `csrfField(csrf)` 辅助函数
- [ ] 1.2 `layout()` 函数增加 `csrf` 参数，注入 `<meta name="csrf-token">`
- [ ] 1.3 `pages.ts` 新增 `assertPageCsrf(req, form)` 校验函数

## 阶段 2：表单嵌入 token

- [ ] 2.1 用户端表单（实例操作）嵌入 `_csrf` 隐藏字段
- [ ] 2.2 管理后台表单（用户管理/设置）嵌入 `_csrf` 隐藏字段
- [ ] 2.3 认证表单（setup/register）嵌入 `_csrf` 隐藏字段

## 阶段 3：POST handler 校验

- [ ] 3.1 所有已登录用户的 POST handler 在 `readForm` 后调用 `assertPageCsrf`
- [ ] 3.2 确认 /login、/forgot-password、/reset-password 豁免校验

## 阶段 4：验证

- [ ] 4.1 类型检查通过
- [ ] 4.2 冒烟测试通过
- [ ] 4.3 补充安全回归测试：缺少 CSRF token 的 POST 返回 403
- [ ] 4.4 补充安全回归测试：错误 CSRF token 的 POST 返回 403
- [ ] 4.5 归档变更

## 预估时间

- 阶段 1：30 分钟
- 阶段 2：1 小时
- 阶段 3：30 分钟
- 阶段 4：30 分钟
- **总计：2.5 小时**
