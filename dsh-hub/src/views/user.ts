/**
 * DSH Hub · 用户端页面（Web UI MVP）
 *
 * 实例列表 / 实例详情 页面渲染
 */
import { escapeHtml } from '../http.ts';
import { layout } from './layout.ts';
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
export function renderInstancesPage(user: UserRow, instances: InstanceInfo[], flash?: { type: string; message: string }): string {
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
                      <button type="submit" class="btn btn-sm btn-success">启动</button>
                     </form>`
                  : ''}
                ${inst.status === 'running'
                  ? `<form method="POST" action="/instances/${inst.id}/stop" style="display:inline">
                      <button type="submit" class="btn btn-sm btn-secondary">停止</button>
                     </form>
                     <form method="POST" action="/instances/${inst.id}/restart" style="display:inline">
                      <button type="submit" class="btn btn-sm btn-primary">重启</button>
                     </form>`
                  : ''}
                <form method="POST" action="/instances/${inst.id}/delete" style="display:inline"
                      onsubmit="return confirm('确定要删除实例「${escapeHtml(inst.name)}」吗？此操作不可恢复。')">
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

  return layout('我的实例', content, user, flash);
}

/** 新建实例页面（/instances/new） */
export function renderNewInstancePage(user: UserRow, error?: string): string {
  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';

  const content = `
    <h1 style="margin-bottom:1.5rem">新建实例</h1>
    <div class="card" style="max-width:500px">
      ${errorHtml}
      <form method="POST" action="/instances">
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

  return layout('新建实例', content, user);
}

/** 实例详情页（/instances/:id） */
export function renderInstanceDetailPage(user: UserRow, instance: InstanceInfo, logs: string): string {
  const content = `
    <div style="margin-bottom:1rem">
      <a href="/" style="color:var(--gray-600)">← 返回列表</a>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
      <h1>${escapeHtml(instance.name)}</h1>
      <div class="actions">
        ${instance.status === 'stopped' || instance.status === 'failed'
          ? `<form method="POST" action="/instances/${instance.id}/start" style="display:inline">
              <button type="submit" class="btn btn-success">启动</button>
             </form>`
          : ''}
        ${instance.status === 'running'
          ? `<form method="POST" action="/instances/${instance.id}/stop" style="display:inline">
              <button type="submit" class="btn btn-secondary">停止</button>
             </form>
             <form method="POST" action="/instances/${instance.id}/restart" style="display:inline">
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
        ? `<p>通过网关访问：<a href="${escapeHtml(buildInstanceUrl(user.slug, instance.id, config.hubDomain))}" target="_blank">${escapeHtml(buildInstanceUrl(user.slug, instance.id, config.hubDomain))}</a></p>`
        : `<p style="color:var(--gray-600)">实例未运行，请先启动</p>`
      }
    </div>
  `;

  return layout(instance.name, content, user);
}
