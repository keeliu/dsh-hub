/**
 * DSH Hub · 用户端页面（Web UI MVP）
 *
 * 实例列表 / 实例详情 页面渲染
 */
import { escapeHtml } from '../http.ts';
import { layout, csrfField } from './layout.ts';
import { buildInstanceUrl } from '../subdomain.ts';
import { config } from '../config.ts';
import type { UserRow } from '../users.ts';

interface InstanceInfo {
  id: string;
  name: string;
  port: number | null;
  status: string;
  harness_version: string | null;
  trusted_host: string;
  created_at: number;
  last_started_at: number | null;
}

/** 状态标签 */
function statusBadge(status: string): string {
  const map: Record<string, string> = {
    stopped: 'badge-secondary',
    starting: 'badge-warning',
    running: 'badge-success',
    stopping: 'badge-warning',
    failed: 'badge-danger',
  };
  const cls = map[status] || 'badge-secondary';
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

/** 实例列表页（/） */
export function renderInstancesPage(user: UserRow, instances: InstanceInfo[], flash?: { type: string; message: string }, csrf?: string): string {
  const instancesHtml = instances.length === 0
    ? `<div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <p>暂无实例</p>
        <p style="margin-top:0.5rem">创建你的第一个实例开始使用</p>
       </div>`
    : `<table class="table">
        <thead>
          <tr>
            <th>名称</th>
            <th>状态</th>
            <th>端口</th>
            <th>版本</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${instances.map(inst => `
            <tr>
              <td><a href="/instances/${escapeHtml(inst.id)}">${escapeHtml(inst.name)}</a></td>
              <td>${statusBadge(inst.status)}</td>
              <td>${inst.port ?? '-'}</td>
              <td>${inst.harness_version ? escapeHtml(inst.harness_version) : '默认'}</td>
              <td class="actions">
                ${inst.status === 'stopped' || inst.status === 'failed'
                  ? `<form method="POST" action="/instances/${inst.id}/start" style="display:inline">
                      ${csrfField(csrf ?? '')}
                      <button type="submit" class="btn btn-sm btn-success">启动</button>
                     </form>`
                  : ''}
                ${inst.status === 'running'
                  ? `<form method="POST" action="/instances/${inst.id}/stop" style="display:inline">
                      ${csrfField(csrf ?? '')}
                      <button type="submit" class="btn btn-sm btn-secondary">停止</button>
                     </form>
                     <form method="POST" action="/instances/${inst.id}/restart" style="display:inline">
                      ${csrfField(csrf ?? '')}
                      <button type="submit" class="btn btn-sm btn-primary">重启</button>
                     </form>`
                  : ''}
                <form method="POST" action="/instances/${inst.id}/delete" style="display:inline"
                      onsubmit="return confirm('确定要删除实例「${escapeHtml(inst.name)}」吗？此操作不可恢复。')">
                  ${csrfField(csrf ?? '')}
                  <button type="submit" class="btn btn-sm btn-danger">删除</button>
                </form>
              </td>
            </tr>
          `).join('')}
        </tbody>
       </table>`;

  const content = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
      <h1>我的实例</h1>
      <form method="GET" action="/instances/new" style="display:inline">
        <button type="submit" class="btn btn-primary">+ 新建实例</button>
      </form>
    </div>
    <div class="card">
      ${instancesHtml}
    </div>
    <div class="card">
      <div class="card-title">配额信息</div>
      <p>最大实例数：${user.max_instances} | 最大并发运行：${user.max_running}</p>
    </div>
  `;

  return layout('我的实例', content, user, flash, csrf);
}

/** 新建实例页面（/instances/new） */
export function renderNewInstancePage(user: UserRow, error?: string, csrf?: string): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';

  const content = `
    <h1 style="margin-bottom:1.5rem">新建实例</h1>
    <div class="card" style="max-width:500px">
      ${errorHtml}
      <form method="POST" action="/instances">
        ${csrfField(csrf ?? '')}
        <div class="form-group">
          <label class="form-label" for="name">实例名称</label>
          <input type="text" id="name" name="name" class="form-control" placeholder="我的实例" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="harness_version">DSH 版本（可选）</label>
          <input type="text" id="harness_version" name="harness_version" class="form-control" placeholder="留空使用默认版本">
          <small style="color:var(--gray-600)">格式如 0.1.1-rc.2</small>
        </div>
        <div style="display:flex;gap:0.5rem">
          <button type="submit" class="btn btn-primary">创建</button>
          <a href="/" class="btn btn-secondary">取消</a>
        </div>
      </form>
    </div>
  `;

  return layout('新建实例', content, user, undefined, csrf);
}

/** 实例详情页（/instances/:id） */
export function renderInstanceDetailPage(user: UserRow, instance: InstanceInfo, logs: string, csrf?: string): string {
  const content = `
    <div style="margin-bottom:1rem">
      <a href="/" style="color:var(--gray-600)">← 返回列表</a>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
      <h1>${escapeHtml(instance.name)}</h1>
      <div class="actions">
        ${instance.status === 'stopped' || instance.status === 'failed'
          ? `<form method="POST" action="/instances/${instance.id}/start" style="display:inline">
              ${csrfField(csrf ?? '')}
              <button type="submit" class="btn btn-success">启动</button>
             </form>`
          : ''}
        ${instance.status === 'running'
          ? `<form method="POST" action="/instances/${instance.id}/stop" style="display:inline">
              ${csrfField(csrf ?? '')}
              <button type="submit" class="btn btn-secondary">停止</button>
             </form>
             <form method="POST" action="/instances/${instance.id}/restart" style="display:inline">
              ${csrfField(csrf ?? '')}
              <button type="submit" class="btn btn-primary">重启</button>
             </form>`
          : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-title">实例信息</div>
      <table class="table" style="margin:0">
        <tr><td style="width:150px;font-weight:500">实例 ID</td><td><code>${escapeHtml(instance.id)}</code></td></tr>
        <tr><td style="font-weight:500">状态</td><td>${statusBadge(instance.status)}</td></tr>
        <tr><td style="font-weight:500">端口</td><td>${instance.port ?? '-'}</td></tr>
        <tr><td style="font-weight:500">版本</td><td>${instance.harness_version ? escapeHtml(instance.harness_version) : '默认'}</td></tr>
        <tr><td style="font-weight:500">Trusted Host</td><td><code>${escapeHtml(instance.trusted_host)}</code></td></tr>
        <tr><td style="font-weight:500">创建时间</td><td>${new Date(instance.created_at).toLocaleString('zh-CN')}</td></tr>
        ${instance.last_started_at ? `<tr><td style="font-weight:500">最近启动</td><td>${new Date(instance.last_started_at).toLocaleString('zh-CN')}</td></tr>` : ''}
      </table>
    </div>

    ${instance.status === 'running' ? `
    <div class="card">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>日志</span>
        <a href="/instances/${instance.id}/logs" class="btn btn-sm btn-secondary">刷新</a>
      </div>
      <div class="log-viewer">${escapeHtml(logs) || '(暂无日志)'}</div>
    </div>
    ` : ''}

    <div class="card">
      <div class="card-title">访问实例</div>
      ${instance.status === 'running'
        ? `<p>通过网关访问：<a href="${escapeHtml(buildInstanceUrl(user.slug, instance.id, instance.trusted_host || config.hubDomain))}" target="_blank">${escapeHtml(buildInstanceUrl(user.slug, instance.id, instance.trusted_host || config.hubDomain))}</a></p>`
        : `<p style="color:var(--gray-600)">实例未运行，请先启动</p>`
      }
    </div>
  `;

  return layout(instance.name, content, user, undefined, csrf);
}

// ========== 会员系统页面 ==========

interface MembershipInfo {
  type: string | null;
  expiresAt: number | null;
  isActive: boolean;
  trialUsed: boolean;
}

interface OrderInfo {
  id: number;
  membership_type: string;
  amount: number;
  status: string;
  created_at: number;
  paid_at: number | null;
}

const MEMBERSHIP_LABELS: Record<string, string> = {
  trial: '1天体验会员',
  monthly: '1个月会员',
  yearly: '1年会员',
};

const MEMBERSHIP_PRICES: Record<string, string> = {
  trial: '免费',
  monthly: '¥19.9',
  yearly: '¥198',
};

/** 会员购买页面（/membership） */
export function renderMembershipPage(user: UserRow, membership: MembershipInfo, error?: string | null, csrf?: string): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';
  
  // 当前会员状态展示
  const statusHtml = membership.isActive
    ? `<div class="alert alert-success">
        <strong>当前会员：</strong>${MEMBERSHIP_LABELS[membership.type!] || membership.type}
        <br><small>到期时间：${new Date(membership.expiresAt!).toLocaleString('zh-CN')}</small>
       </div>`
    : membership.trialUsed
      ? `<div class="alert alert-warning">您的会员已过期，请续费以继续使用</div>`
      : '';

  // 套餐卡片
  const plansHtml = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1rem;margin-top:1.5rem">
      ${!membership.trialUsed ? `
      <div class="card" style="text-align:center;border:2px solid var(--primary-color,#007bff)">
        <div style="font-size:1.5rem;font-weight:600;margin-bottom:0.5rem">🎁 体验会员</div>
        <div style="font-size:2rem;font-weight:700;color:var(--primary-color,#007bff)">免费</div>
        <p style="color:var(--gray-600);margin:1rem 0">1天体验，仅限首次使用</p>
        <form method="POST" action="/membership/purchase">
          ${csrfField(csrf ?? '')}
          <input type="hidden" name="type" value="trial">
          <button type="submit" class="btn btn-primary" style="width:100%">立即体验</button>
        </form>
      </div>
      ` : ''}
      
      <div class="card" style="text-align:center">
        <div style="font-size:1.5rem;font-weight:600;margin-bottom:0.5rem">📅 月度会员</div>
        <div style="font-size:2rem;font-weight:700;color:var(--success-color,#28a745)">¥19.9</div>
        <p style="color:var(--gray-600);margin:1rem 0">30天有效期</p>
        <form method="POST" action="/membership/purchase">
          ${csrfField(csrf ?? '')}
          <input type="hidden" name="type" value="monthly">
          <button type="submit" class="btn btn-success" style="width:100%">立即购买</button>
        </form>
      </div>
      
      <div class="card" style="text-align:center;border:2px solid var(--warning-color,#ffc107)">
        <div style="font-size:1.5rem;font-weight:600;margin-bottom:0.5rem">⭐ 年度会员</div>
        <div style="font-size:2rem;font-weight:700;color:var(--warning-color,#ffc107)">¥198</div>
        <p style="color:var(--gray-600);margin:1rem 0">365天有效期，更划算</p>
        <form method="POST" action="/membership/purchase">
          ${csrfField(csrf ?? '')}
          <input type="hidden" name="type" value="yearly">
          <button type="submit" class="btn btn-warning" style="width:100%">立即购买</button>
        </form>
      </div>
    </div>
  `;

  const content = `
    <h1 style="margin-bottom:1rem">会员购买</h1>
    ${statusHtml}
    ${errorHtml}
    <div class="card">
      <div class="card-title">选择会员套餐</div>
      <p style="color:var(--gray-600)">
        会员可使用 <strong>乌鸦Work</strong> 平台功能。大模型 API Key 需要您自行准备并维护到系统中。
      </p>
      ${plansHtml}
    </div>
  `;

  return layout('会员购买', content, user, undefined, csrf);
}

/** 用户个人中心（/profile） */
export function renderProfilePage(user: UserRow, membership: MembershipInfo, orders: OrderInfo[], csrf?: string): string {
  const membershipStatusHtml = membership.isActive
    ? `<span class="badge badge-success">有效会员</span> ${MEMBERSHIP_LABELS[membership.type!] || membership.type}
       <br><small style="color:var(--gray-600)">到期时间：${new Date(membership.expiresAt!).toLocaleString('zh-CN')}</small>`
    : `<span class="badge badge-secondary">无有效会员</span>
       <br><a href="/membership" class="btn btn-sm btn-primary" style="margin-top:0.5rem">立即购买</a>`;

  const ordersHtml = orders.length === 0
    ? '<p style="color:var(--gray-600)">暂无订单记录</p>'
    : `<table class="table">
        <thead>
          <tr>
            <th>订单号</th>
            <th>会员类型</th>
            <th>金额</th>
            <th>状态</th>
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(order => `
            <tr>
              <td><code>#${order.id}</code></td>
              <td>${MEMBERSHIP_LABELS[order.membership_type] || order.membership_type}</td>
              <td>¥${order.amount.toFixed(2)}</td>
              <td>${order.status === 'paid' ? '<span class="badge badge-success">已支付</span>' : 
                   order.status === 'pending' ? '<span class="badge badge-warning">待支付</span>' :
                   `<span class="badge badge-secondary">${escapeHtml(order.status)}</span>`}</td>
              <td>${new Date(order.created_at).toLocaleString('zh-CN')}</td>
            </tr>
          `).join('')}
        </tbody>
       </table>`;

  const content = `
    <h1 style="margin-bottom:1.5rem">个人中心</h1>
    
    <div class="card">
      <div class="card-title">会员信息</div>
      <div style="padding:1rem 0">
        ${membershipStatusHtml}
      </div>
      ${membership.isActive ? `<a href="/membership" class="btn btn-sm btn-secondary">续费</a>` : ''}
    </div>
    
    <div class="card" style="margin-top:1rem">
      <div class="card-title">账户信息</div>
      <table class="table" style="margin:0">
        <tr><td style="width:150px;font-weight:500">昵称</td><td>${escapeHtml(user.nickname)}</td></tr>
        <tr><td style="font-weight:500">用户名</td><td>${escapeHtml(user.username || '-')}</td></tr>
        <tr><td style="font-weight:500">邮箱</td><td>${escapeHtml(user.email || '-')}</td></tr>
        <tr><td style="font-weight:500">角色</td><td>${escapeHtml(user.role)}</td></tr>
      </table>
    </div>
    
    <div class="card" style="margin-top:1rem">
      <div class="card-title">订单记录</div>
      ${ordersHtml}
    </div>
  `;

  return layout('个人中心', content, user, undefined, csrf);
}
