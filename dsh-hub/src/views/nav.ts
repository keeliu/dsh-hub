/**
 * DSH Hub · 导航声明与渲染
 *
 * 职责：把「导航有哪些项、谁能看到」从渲染逻辑里拆出来，形成**声明表**；
 * 顶部导航与管理端侧栏都从这里取数据，不再各处写三元组。
 * 关键决策：
 *   - `navItems(role)` 是顶部导航的唯一真相源；此前这些分支散在
 *     `layout.ts` 的 `renderNav()` 里，加一项要在模板里改多处。
 *   - 管理端侧栏项从 `admin.ts` 迁到这里，`admin.ts` 只负责渲染。
 *   - 移动端（≤768px）展开按钮带 `aria-expanded` / `aria-controls`，
 *     替换原先「`.admin-sidebar { display: none }` 直接消失、无替代导航」的做法。
 * 文档：`design.md` §4（布局系统）、§9（可访问性）。
 */

import { csrfField } from './components.ts';
import { escapeHtml } from '../http.ts';
import type { UserRow } from '../users.ts';

export interface NavItem {
  href: string;
  label: string;
}

export interface AdminNavItem extends NavItem {
  /** 与各页面传入的 `active` 键对应 */
  key: string;
  icon: string;
}

/** 顶部导航项（按角色过滤后的结果） */
export function navItems(role: string | null | undefined): NavItem[] {
  if (!role) return [];
  const isAdmin = role === 'admin' || role === 'root';
  return isAdmin
    ? [{ href: '/admin', label: '系统管理' }]
    : [{ href: '/', label: '智能体' }];
}

/** 管理端侧栏项 */
export function adminNavItems(): AdminNavItem[] {
  return [
    { key: 'dashboard', href: '/admin', label: '仪表盘', icon: '📊' },
    { key: 'users', href: '/admin/users', label: '用户管理', icon: '👥' },
    { key: 'instances', href: '/admin/instances', label: '实例总览', icon: '📦' },
    { key: 'membership', href: '/admin/membership', label: '会员管理', icon: '💎' },
    { key: 'prices', href: '/admin/prices', label: '价格管理', icon: '💰' },
    { key: 'plugins', href: '/admin/plugins', label: '预置插件', icon: '🧩' },
    { key: 'audit', href: '/admin/audit', label: '审计日志', icon: '📋' },
    { key: 'settings', href: '/admin/settings', label: '全局设置', icon: '⚙️' },
  ];
}

/**
 * 渲染顶部导航。
 *
 * `csrf` 用于退出登录表单——历史上这里写的是 `name="csrf" value=""`，
 * 服务端读 `_csrf`，所以该表单一直是死的（详见 `views/components.ts`）。
 */
export function renderNav(user: UserRow | null, csrf?: string): string {
  if (!user) {
    return `
      <header class="navbar">
        <a href="/" class="navbar-brand">乌鸦 work</a>
      </header>`;
  }

  const isAdmin = user.role === 'admin' || user.role === 'root';
  const homeLink = isAdmin ? '/admin' : '/';
  const initial = user.nickname.charAt(0).toUpperCase();

  return `
    <header class="navbar">
      <a href="${homeLink}" class="navbar-brand">乌鸦 work</a>
      <button type="button" class="navbar-toggle" id="nav-toggle"
              aria-expanded="false" aria-controls="navbar-nav" aria-label="展开导航菜单">
        <span aria-hidden="true">☰</span>
      </button>
      <nav class="navbar-nav" id="navbar-nav" aria-label="主导航">
        ${navItems(user.role).map(item => `<a href="${item.href}">${escapeHtml(item.label)}</a>`).join('')}
        <div class="navbar-user">
          <div class="user-dropdown">
            <button type="button" class="user-dropdown-toggle"
                    aria-haspopup="true" aria-expanded="false" aria-controls="user-menu">
              <span class="avatar" aria-hidden="true">${escapeHtml(initial)}</span>
              <span>${escapeHtml(user.nickname)}</span>
            </button>
            <div class="user-dropdown-menu" id="user-menu" role="menu">
              <a href="/profile" class="dropdown-item" role="menuitem">个人中心</a>
              <a href="/instances" class="dropdown-item" role="menuitem">实例管理</a>
              <div class="dropdown-divider" role="separator"></div>
              <form method="POST" action="/api/auth/logout" style="margin:0">
                ${csrfField(csrf ?? '')}
                <button type="submit" class="dropdown-item dropdown-item-danger" role="menuitem">退出系统</button>
              </form>
            </div>
          </div>
        </div>
      </nav>
    </header>
    <script>
      (function () {
        // 用户下拉菜单：同步 aria-expanded，并支持 Esc 关闭
        document.querySelectorAll('.user-dropdown-toggle').forEach(function (toggle) {
          var menu = toggle.nextElementSibling;
          function setOpen(open) {
            menu.style.display = open ? 'block' : 'none';
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          }
          toggle.addEventListener('click', function (e) {
            e.preventDefault();
            setOpen(menu.style.display !== 'block');
          });
          toggle.parentElement.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { setOpen(false); toggle.focus(); }
          });
        });
        document.addEventListener('click', function (e) {
          if (!e.target.closest('.user-dropdown')) {
            document.querySelectorAll('.user-dropdown-menu').forEach(function (menu) {
              menu.style.display = 'none';
            });
            document.querySelectorAll('.user-dropdown-toggle').forEach(function (t) {
              t.setAttribute('aria-expanded', 'false');
            });
          }
        });

        // 窄屏导航抽屉
        var navToggle = document.getElementById('nav-toggle');
        if (navToggle) {
          var nav = document.getElementById('navbar-nav');
          navToggle.addEventListener('click', function () {
            var open = nav.classList.toggle('is-open');
            navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          });
        }
      })();
    </script>`;
}
