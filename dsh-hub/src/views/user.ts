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
import type { MembershipType } from '../membership.ts';

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
    ? `<div class="alert alert-success" style="text-align:center;margin-bottom:1.5rem">
        <strong>当前会员：</strong>${MEMBERSHIP_LABELS[membership.type!] || membership.type}
        <br><small>到期时间：${new Date(membership.expiresAt!).toLocaleString('zh-CN')}</small>
       </div>`
    : membership.trialUsed
      ? `<div class="alert alert-warning" style="text-align:center;margin-bottom:1.5rem">您的会员已过期，请续费以继续使用</div>`
      : '';

  // 套餐卡片 - 按照设计稿的三列布局
  const plansHtml = `
    <div class="pricing-grid">
      <!-- 体验会员 -->
      ${!membership.trialUsed ? `
      <div class="pricing-card">
        <div class="pricing-header">
          <div class="pricing-name">体验会员</div>
          <div class="pricing-price">
            <span class="pricing-amount">免费</span>
          </div>
          <p class="pricing-desc">1天体验，仅限首次使用</p>
        </div>
        <ul class="pricing-features">
          <li>完整功能体验</li>
          <li>1天有效期</li>
          <li>仅限新用户</li>
        </ul>
        <button type="button" class="btn btn-outline-primary btn-block" onclick="startPayment('trial')">立即体验</button>
      </div>
      ` : ''}
      
      <!-- 月度会员 -->
      <div class="pricing-card">
        <div class="pricing-header">
          <div class="pricing-name">月度会员</div>
          <div class="pricing-price">
            <span class="pricing-currency">¥</span>
            <span class="pricing-amount">19.9</span>
          </div>
          <p class="pricing-desc">30天有效期</p>
        </div>
        <ul class="pricing-features">
          <li>完整功能使用</li>
          <li>30天有效期</li>
          <li>随时续费</li>
        </ul>
        <button type="button" class="btn btn-outline-primary btn-block" onclick="startPayment('monthly')">立即购买</button>
      </div>
      
      <!-- 年度会员 - 推荐 -->
      <div class="pricing-card pricing-card-featured">
        <div class="pricing-badge">推荐</div>
        <div class="pricing-header">
          <div class="pricing-name">年度会员</div>
          <div class="pricing-price">
            <span class="pricing-currency">¥</span>
            <span class="pricing-amount">198</span>
          </div>
          <p class="pricing-desc">365天有效期，更划算</p>
        </div>
        <ul class="pricing-features">
          <li>完整功能使用</li>
          <li>365天有效期</li>
          <li>节省 45%</li>
          <li>优先技术支持</li>
        </ul>
        <button type="button" class="btn btn-primary btn-block" onclick="startPayment('yearly')">立即购买</button>
      </div>
    </div>
  `;

  // 支付弹窗
  const paymentModal = `
    <div id="payment-modal" class="payment-modal" style="display:none">
      <div class="payment-modal-overlay" onclick="closePaymentModal()"></div>
      <div class="payment-modal-content">
        <div class="payment-modal-header">
          <h3>扫码支付</h3>
          <button class="payment-modal-close" onclick="closePaymentModal()">&times;</button>
        </div>
        <div id="payment-loading" class="payment-loading">
          <div class="spinner"></div>
          <p>正在创建订单...</p>
        </div>
        <div id="payment-qrcode" class="payment-qrcode" style="display:none">
          <p class="payment-amount">请支付 <strong id="payment-amount"></strong></p>
          <div id="qrcode-container" class="qrcode-img"></div>
          <p class="payment-hint">请使用微信或支付宝扫码支付</p>
          <div class="payment-status">
            <span id="payment-waiting">等待支付中...</span>
            <a id="payment-link" href="#" target="_blank" class="btn btn-sm btn-secondary" style="display:none">点击跳转支付</a>
          </div>
        </div>
        <div id="payment-error" class="payment-error" style="display:none">
          <p class="error-text" id="error-message"></p>
          <button class="btn btn-secondary" onclick="closePaymentModal()">关闭</button>
        </div>
      </div>
    </div>
  `;

  // 支付 JavaScript
  const paymentScript = `
    <script>
    const CSRF_TOKEN = ${JSON.stringify(csrf ?? '')};
    let pollTimer = null;
    let currentOrderId = null;

    async function startPayment(type) {
      const modal = document.getElementById('payment-modal');
      const loading = document.getElementById('payment-loading');
      const qrcode = document.getElementById('payment-qrcode');
      const error = document.getElementById('payment-error');
      
      modal.style.display = 'flex';
      loading.style.display = 'block';
      qrcode.style.display = 'none';
      error.style.display = 'none';

      try {
        const res = await fetch('/api/payment/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF_TOKEN },
          body: JSON.stringify({ type }),
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.message || '创建订单失败');
        }

        currentOrderId = data.orderId;
        document.getElementById('payment-amount').textContent = '¥' + data.amount.toFixed(2);
        
        loading.style.display = 'none';
        qrcode.style.display = 'block';

        // 显示二维码
        if (data.urlQrcode) {
          document.getElementById('qrcode-container').innerHTML = 
            '<img src="' + data.urlQrcode + '" alt="支付二维码" style="width:200px;height:200px">';
        }
        if (data.url) {
          document.getElementById('payment-link').href = data.url;
          document.getElementById('payment-link').style.display = 'inline-block';
        }

        // 开始轮询订单状态
        startPolling(data.orderId);
      } catch (e) {
        loading.style.display = 'none';
        error.style.display = 'block';
        document.getElementById('error-message').textContent = e.message || '支付创建失败';
      }
    }

    function startPolling(orderId) {
      let attempts = 0;
      const maxAttempts = 100; // 5 minutes at 3s interval
      
      pollTimer = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
          clearInterval(pollTimer);
          document.getElementById('payment-waiting').textContent = '支付超时，请刷新页面重试';
          return;
        }

        try {
          const res = await fetch('/api/payment/query/' + orderId);
          const data = await res.json();
          
          if (data.paid) {
            clearInterval(pollTimer);
            document.getElementById('payment-waiting').textContent = '支付成功！正在跳转...';
            setTimeout(() => { window.location.href = '/payment/return?order_id=' + orderId; }, 1000);
          }
        } catch (e) {
          // ignore polling errors
        }
      }, 3000);
    }

    function closePaymentModal() {
      if (pollTimer) clearInterval(pollTimer);
      document.getElementById('payment-modal').style.display = 'none';
    }
    </script>
  `;

  const content = `
    <div class="page-header">
      <h1 class="page-title">选择会员套餐</h1>
      <p class="page-subtitle">会员可使用 <strong>乌鸦Work</strong> 平台功能。大模型 API Key 需要您自行准备并维护到系统中。</p>
    </div>
    ${statusHtml}
    ${errorHtml}
    ${plansHtml}
    ${paymentModal}
    ${paymentScript}
  `;

  return layout('会员购买', content, user, undefined, csrf);
}

/** 用户个人中心（/profile） */
export function renderProfilePage(user: UserRow, membership: MembershipInfo, orders: OrderInfo[], csrf?: string): string {
  const membershipStatusHtml = membership.isActive
    ? `<div class="membership-status membership-active">
        <div class="membership-icon">✓</div>
        <div class="membership-info">
          <div class="membership-type">${MEMBERSHIP_LABELS[membership.type!] || membership.type}</div>
          <div class="membership-expires">到期时间：${new Date(membership.expiresAt!).toLocaleString('zh-CN')}</div>
        </div>
        <a href="/membership" class="btn btn-sm btn-secondary">续费</a>
       </div>`
    : `<div class="membership-status membership-inactive">
        <div class="membership-icon">!</div>
        <div class="membership-info">
          <div class="membership-type">无有效会员</div>
          <div class="membership-expires">购买会员以使用完整功能</div>
        </div>
        <a href="/membership" class="btn btn-sm btn-primary">立即购买</a>
       </div>`;

  const ordersHtml = orders.length === 0
    ? '<div class="empty-state"><p>暂无订单记录</p></div>'
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
    <div class="page-header">
      <h1 class="page-title">个人中心</h1>
    </div>
    
    <div class="card">
      <div class="card-title">会员信息</div>
      ${membershipStatusHtml}
    </div>
    
    <div class="card">
      <div class="card-title">账户信息</div>
      <div class="profile-info">
        <div class="profile-row">
          <span class="profile-label">昵称</span>
          <span class="profile-value">${escapeHtml(user.nickname)}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">用户名</span>
          <span class="profile-value">${escapeHtml(user.username || '-')}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">邮箱</span>
          <span class="profile-value">${escapeHtml(user.email || '-')}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">角色</span>
          <span class="profile-value">${escapeHtml(user.role)}</span>
        </div>
      </div>
    </div>
    
    <div class="card">
      <div class="card-title">订单记录</div>
      ${ordersHtml}
    </div>
  `;

  return layout('个人中心', content, user, undefined, csrf);
}

export function renderPaymentReturnPage(
  user: UserRow,
  membership: { type: MembershipType | null; expiresAt: number | null; isActive: boolean; trialUsed: boolean },
  csrf: string | null
): string {
  const MEMBERSHIP_LABELS: Record<string, string> = {
    trial: '体验版',
    monthly: '月度会员',
    yearly: '年度会员',
  };

  const content = `
    <div class="payment-return">
      <div class="payment-return-icon">✓</div>
      <h2>支付成功</h2>
      <p class="payment-return-desc">您的会员已激活，现在可以开始使用所有功能</p>
      
      <div class="card" style="margin-top: 2rem; text-align: left;">
        <div class="card-title">当前会员</div>
        <div class="membership-status">
          <span class="membership-badge ${membership.isActive ? membership.type : 'expired'}">
            ${membership.isActive && membership.type ? (MEMBERSHIP_LABELS[membership.type] ?? '会员') : '未激活'}
          </span>
          ${membership.expiresAt ? `<span class="membership-expire">到期时间：${new Date(membership.expiresAt).toLocaleString('zh-CN')}</span>` : ''}
        </div>
      </div>
      
      <div class="payment-return-actions">
        <a href="/" class="btn btn-primary">进入首页</a>
        <a href="/profile" class="btn btn-secondary">查看个人中心</a>
      </div>
    </div>
  `;

  return layout('支付成功', content, user, undefined, csrf ?? undefined);
}
