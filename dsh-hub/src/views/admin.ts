/**
 * DSH Hub · 管理后台页面（Web UI MVP）
 *
 * 仪表盘 / 用户管理 / 实例总览 / 审计日志 / 全局设置
 */
import { escapeHtml } from '../http.ts';
import { layout, csrfField } from './layout.ts';
import type { UserRow } from '../users.ts';

interface InstanceInfo {
  id: string;
  name: string;
  port: number | null;
  status: string;
  owner_id: number;
  nickname?: string;
}

interface UserInfo {
  id: number;
  nickname: string;
  username: string;
  role: string;
  status: string;
  max_instances: number;
  max_running: number;
  created_at: number;
  last_login_at: number | null;
  membership_type: string | null;
  membership_expires_at: number | null;
}

interface AuditEntry {
  id: number;
  actor_id: number | null;
  target_user_id: number | null;
  action: string;
  detail: string | null;
  created_at: number;
}

const MEMBERSHIP_LABELS: Record<string, string> = {
  trial: '体验会员',
  monthly: '月度会员',
  yearly: '年度会员',
};

/** 状态标签 */
function statusBadge(status: string): string {
  const map: Record<string, string> = {
    stopped: 'badge-secondary',
    starting: 'badge-warning',
    running: 'badge-success',
    stopping: 'badge-warning',
    failed: 'badge-danger',
    active: 'badge-success',
    disabled: 'badge-danger',
  };
  const cls = map[status] || 'badge-secondary';
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

/** 管理后台侧边栏 */
function adminSidebar(active: string): string {
  const items = [
    { key: 'dashboard', href: '/admin', label: '仪表盘', icon: '📊' },
    { key: 'users', href: '/admin/users', label: '用户管理', icon: '👥' },
    { key: 'instances', href: '/admin/instances', label: '实例总览', icon: '📦' },
    { key: 'membership', href: '/admin/membership', label: '会员管理', icon: '💎' },
    { key: 'audit', href: '/admin/audit', label: '审计日志', icon: '📋' },
    { key: 'settings', href: '/admin/settings', label: '全局设置', icon: '⚙️' },
  ];

  return `
    <div class="admin-layout">
      <nav class="admin-sidebar">
        ${items.map(item => `
          <a href="${item.href}" class="${active === item.key ? 'active' : ''}">
            <span style="margin-right:0.5rem">${item.icon}</span>${item.label}
          </a>
        `).join('')}
      </nav>
      <div class="admin-content">
  `;
}

function adminSidebarClose(): string {
  return '</div></div>';
}

/** 仪表盘（/admin） */
export function renderDashboardPage(user: UserRow, stats: { users: number; instances: number; running: number }): string {
  const content = `
    <div class="page-header">
      <h1 class="page-title">管理后台</h1>
    </div>
    ${adminSidebar('dashboard')}
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.users}</div>
        <div class="stat-label">用户总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.instances}</div>
        <div class="stat-label">实例总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.running}</div>
        <div class="stat-label">运行中实例</div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">快捷操作</div>
      <div class="actions">
        <a href="/admin/users" class="btn btn-primary">用户管理</a>
        <a href="/admin/instances" class="btn btn-primary">实例总览</a>
        <a href="/admin/settings" class="btn btn-secondary">全局设置</a>
      </div>
    </div>
    ${adminSidebarClose()}
  `;

  return layout('管理后台', content, user);
}

/** 用户管理页（/admin/users） */
export function renderUsersPage(user: UserRow, users: UserInfo[], flash?: { type: string; message: string }, csrf?: string): string {
  const flashHtml = flash ? `<div class="alert alert-${flash.type}">${escapeHtml(flash.message)}</div>` : '';

  const content = `
    <div class="page-header">
      <h1 class="page-title">用户管理</h1>
    </div>
    ${adminSidebar('users')}
    ${flashHtml}
    <div class="card">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>用户列表</span>
        <button onclick="document.getElementById('create-user-form').style.display='block'" class="btn btn-sm btn-primary">+ 创建用户</button>
      </div>
      <div id="create-user-form" style="display:none;margin-bottom:1rem;padding:1rem;background:var(--bg-page);border-radius:var(--radius-md)">
        <form method="POST" action="/admin/users">
          ${csrfField(csrf ?? '')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
            <div class="form-group" style="margin:0">
              <label class="form-label">昵称</label>
              <input type="text" name="nickname" class="form-control" required>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">账号</label>
              <input type="text" name="username" class="form-control" required pattern="[a-z0-9_]{3,20}" title="3-20 位小写字母、数字或下划线">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">密码</label>
              <input type="password" name="password" class="form-control" required minlength="8">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">角色</label>
              <select name="role" class="form-control">
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option value="root">root</option>
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">邮箱</label>
              <input type="email" name="email" class="form-control">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">会员类型（可选）</label>
              <select name="membership_type" class="form-control">
                <option value="">无</option>
                <option value="trial">体验会员（1天）</option>
                <option value="monthly">月度会员（30天）</option>
                <option value="yearly">年度会员（365天）</option>
              </select>
            </div>
          </div>
          <div style="margin-top:0.75rem">
            <button type="submit" class="btn btn-primary">创建</button>
            <button type="button" onclick="document.getElementById('create-user-form').style.display='none'" class="btn btn-secondary">取消</button>
          </div>
        </form>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>昵称</th>
            <th>账号</th>
            <th>角色</th>
            <th>状态</th>
            <th>会员</th>
            <th>配额</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>${u.id}</td>
              <td>${escapeHtml(u.nickname)}</td>
              <td>${escapeHtml(u.username)}</td>
              <td><span class="badge badge-info">${escapeHtml(u.role)}</span></td>
              <td>${statusBadge(u.status)}</td>
              <td>${u.membership_type ? `<span class="badge badge-success">${MEMBERSHIP_LABELS[u.membership_type] || u.membership_type}</span><br><small style="color:var(--text-secondary)">${u.membership_expires_at ? new Date(u.membership_expires_at).toLocaleDateString('zh-CN') + ' 到期' : ''}</small>` : '<span class="badge badge-secondary">无</span>'}</td>
              <td>${u.max_instances} / ${u.max_running}</td>
              <td>${new Date(u.created_at).toLocaleDateString('zh-CN')}</td>
              <td class="actions">
                <form method="POST" action="/admin/users/${u.id}/membership" style="display:inline">
                  ${csrfField(csrf ?? '')}
                  <select name="type" style="font-size:12px;padding:4px;border-radius:var(--radius-sm);border:1px solid var(--border)">
                    <option value="monthly">月度</option>
                    <option value="yearly">年度</option>
                    <option value="trial">体验</option>
                  </select>
                  <input type="number" name="days" value="30" min="1" max="365" style="width:50px;font-size:12px;padding:4px;border-radius:var(--radius-sm);border:1px solid var(--border)">
                  <button type="submit" class="btn btn-sm btn-primary">设置</button>
                </form>
                ${u.status === 'active'
                  ? `<form method="POST" action="/admin/users/${u.id}/disable" style="display:inline">
                      ${csrfField(csrf ?? '')}
                      <button type="submit" class="btn btn-sm btn-danger">封禁</button>
                     </form>`
                  : `<form method="POST" action="/admin/users/${u.id}/enable" style="display:inline">
                      ${csrfField(csrf ?? '')}
                      <button type="submit" class="btn btn-sm btn-success">启用</button>
                     </form>`
                }
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${adminSidebarClose()}
  `;

  return layout('用户管理', content, user, flash, csrf);
}

/** 实例总览页（/admin/instances） */
export function renderAdminInstancesPage(user: UserRow, instances: InstanceInfo[], csrf?: string): string {
  const content = `
    <div class="page-header">
      <h1 class="page-title">实例总览</h1>
    </div>
    ${adminSidebar('instances')}
    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>名称</th>
            <th>属主</th>
            <th>状态</th>
            <th>端口</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${instances.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">暂无实例</td></tr>' : ''}
          ${instances.map(inst => `
            <tr>
              <td><code>${escapeHtml(inst.id)}</code></td>
              <td>${escapeHtml(inst.name)}</td>
              <td>${escapeHtml(inst.nickname ?? `用户#${inst.owner_id}`)}</td>
              <td>${statusBadge(inst.status)}</td>
              <td>${inst.port ?? '-'}</td>
              <td class="actions">
                ${inst.status === 'stopped' || inst.status === 'failed'
                  ? `<form method="POST" action="/admin/instances/${inst.id}/start" style="display:inline">
                      ${csrfField(csrf ?? '')}
                      <button type="submit" class="btn btn-sm btn-success">启动</button>
                     </form>`
                  : ''}
                ${inst.status === 'running'
                  ? `<form method="POST" action="/admin/instances/${inst.id}/stop" style="display:inline">
                      ${csrfField(csrf ?? '')}
                      <button type="submit" class="btn btn-sm btn-secondary">停止</button>
                     </form>`
                  : ''}
                <form method="POST" action="/admin/instances/${inst.id}/delete" style="display:inline"
                      onsubmit="return confirm('确定删除实例 ${escapeHtml(inst.id)}？')">
                  ${csrfField(csrf ?? '')}
                  <button type="submit" class="btn btn-sm btn-danger">删除</button>
                </form>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${adminSidebarClose()}
  `;

  return layout('实例总览', content, user, undefined, csrf);
}

/** 审计日志页（/admin/audit） */
export function renderAuditPage(user: UserRow, logs: AuditEntry[]): string {
  const content = `
    <div class="page-header">
      <h1 class="page-title">审计日志</h1>
    </div>
    ${adminSidebar('audit')}
    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>时间</th>
            <th>操作者</th>
            <th>动作</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          ${logs.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary)">暂无日志</td></tr>' : ''}
          ${logs.map(log => `
            <tr>
              <td style="white-space:nowrap">${new Date(log.created_at).toLocaleString('zh-CN')}</td>
              <td>${log.actor_id ?? '-'}</td>
              <td><code>${escapeHtml(log.action)}</code></td>
              <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(log.detail ?? '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${adminSidebarClose()}
  `;

  return layout('审计日志', content, user);
}

/** 全局设置页（/admin/settings） */
export function renderSettingsPage(user: UserRow, settings: Record<string, string>, flash?: { type: string; message: string }, csrf?: string): string {
  const flashHtml = flash ? `<div class="alert alert-${flash.type}">${escapeHtml(flash.message)}</div>` : '';

  const content = `
    <div class="page-header">
      <h1 class="page-title">全局设置</h1>
    </div>
    ${adminSidebar('settings')}
    ${flashHtml}
    <div class="card">
      <form method="POST" action="/admin/settings">
        ${csrfField(csrf ?? '')}
        <div class="form-group">
          <label class="form-label">注册开关</label>
          <select name="registration_open" class="form-control" style="max-width:200px">
            <option value="closed" ${settings.registration_open !== 'open' ? 'selected' : ''}>关闭（仅管理员可建号）</option>
            <option value="open" ${settings.registration_open === 'open' ? 'selected' : ''}>开放</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">默认 DSH 版本</label>
          <input type="text" name="default_harness_version" class="form-control" style="max-width:300px"
                 value="${escapeHtml(settings.default_harness_version ?? '')}" placeholder="留空不限制">
        </div>
        <div class="form-group">
          <label class="form-label">允许的版本列表</label>
          <input type="text" name="allowed_harness_versions" class="form-control" style="max-width:400px"
                 value="${escapeHtml(settings.allowed_harness_versions ?? '')}" placeholder="留空不限制">
        </div>
        <button type="submit" class="btn btn-primary">保存设置</button>
      </form>
    </div>
    ${adminSidebarClose()}
  `;

  return layout('全局设置', content, user, flash, csrf);
}

// ========== 会员管理页面 ==========

interface OrderInfo {
  id: number;
  user_id: number;
  membership_type: string;
  amount: number;
  status: string;
  payment_method: string | null;
  created_at: number;
  paid_at: number | null;
}

/** 管理员会员管理页（/admin/membership） */
export function renderAdminMembershipPage(user: UserRow, orders: OrderInfo[], csrf?: string): string {
  const ordersHtml = orders.length === 0
    ? '<div class="empty-state"><p>暂无订单记录</p></div>'
    : `<table class="table">
        <thead>
          <tr>
            <th>订单号</th>
            <th>用户ID</th>
            <th>会员类型</th>
            <th>金额</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>支付时间</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(order => `
            <tr>
              <td><code>#${order.id}</code></td>
              <td>${order.user_id}</td>
              <td>${MEMBERSHIP_LABELS[order.membership_type] || order.membership_type}</td>
              <td>¥${order.amount.toFixed(2)}</td>
              <td>${order.status === 'paid' ? '<span class="badge badge-success">已支付</span>' : 
                   order.status === 'pending' ? '<span class="badge badge-warning">待支付</span>' :
                   `<span class="badge badge-secondary">${escapeHtml(order.status)}</span>`}</td>
              <td>${new Date(order.created_at).toLocaleString('zh-CN')}</td>
              <td>${order.paid_at ? new Date(order.paid_at).toLocaleString('zh-CN') : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
       </table>`;

  const content = `
    <div class="page-header">
      <h1 class="page-title">会员管理</h1>
    </div>
    ${adminSidebar('membership')}
    <div class="card">
      <div class="card-title">订单记录</div>
      ${ordersHtml}
    </div>
    ${adminSidebarClose()}
  `;

  return layout('会员管理', content, user, undefined, csrf);
}
