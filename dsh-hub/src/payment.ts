/**
 * DSH Hub · 支付模块（虎皮椒 xunhupay 聚合支付）
 *
 * 职责：封装虎皮椒 API（签名生成/验证、发起支付、订单查询、退款）
 * 关联文档：openspec/changes/payment-integration/
 *
 * 设计决策：
 * - 配置从 settings 表读取，fallback 到环境变量
 * - 签名算法：MD5(字典序拼接 + appsecret)，32 位小写
 * - HTTP 请求使用 Node.js 内置 fetch（零依赖）
 */
import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getSetting } from './settings.ts';

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface XunhupayConfig {
  appid: string;
  appsecret: string;
  gateway: string;
}

export interface CreatePaymentParams {
  trade_order_id: string;
  total_fee: string;
  title: string;
  notify_url: string;
  return_url?: string;
  callback_url?: string;
  attach?: string;
}

export interface CreatePaymentResponse {
  errcode: number;
  errmsg: string;
  url_qrcode?: string;
  url?: string;
  openid?: string;
}

export interface QueryPaymentResponse {
  errcode: number;
  errmsg: string;
  data?: {
    status: 'OD' | 'WP' | 'CD';
    open_order_id?: string;
    total_fee?: string;
    transaction_id?: string;
  };
}

export interface RefundPaymentResponse {
  errcode: number;
  errmsg: string;
  trade_order_id?: string;
  refund_fee?: string;
  refund_status?: string;
}

export interface NotifyParams {
  trade_order_id: string;
  total_fee: string;
  transaction_id: string;
  open_order_id: string;
  order_title: string;
  status: string;
  appid: string;
  time: string;
  nonce_str: string;
  hash: string;
  plugins?: string;
  attach?: string;
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const DEFAULT_GATEWAY = 'https://api.xunhupay.com';
const API_VERSION = '1.1';

// ─── 配置读取 ────────────────────────────────────────────────────────────────

export function getXunhupayConfig(db: DatabaseSync): XunhupayConfig | null {
  const appid = getSetting(db, 'xunhupay_appid', process.env.XH_APPID ?? '');
  const appsecret = getSetting(db, 'xunhupay_appsecret', process.env.XH_APPSECRET ?? '');
  const gateway = getSetting(db, 'xunhupay_gateway', '') || process.env.XH_GATEWAY || DEFAULT_GATEWAY;

  if (!appid || !appsecret) return null;
  return { appid, appsecret, gateway };
}

// ─── 签名算法 ────────────────────────────────────────────────────────────────

export function generateHash(params: Record<string, string | undefined | null>, appsecret: string): string {
  const entries = Object.entries(params)
    .filter(([key, val]) => key !== 'hash' && val !== null && val !== undefined && val !== '')
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);

  const str = entries.map(([k, v]) => `${k}=${v}`).join('&');
  return createHash('md5').update(str + appsecret, 'utf8').digest('hex');
}

export function verifyHash(params: Record<string, string | undefined | null>, hash: string, appsecret: string): boolean {
  const expected = generateHash(params, appsecret);
  return expected === hash;
}

// ─── 随机字符串 ──────────────────────────────────────────────────────────────

function nonceStr(): string {
  return randomBytes(16).toString('hex');
}

// ─── HTTP 请求 ───────────────────────────────────────────────────────────────

async function postJson(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`网络请求失败: ${err instanceof Error ? err.message : '未知错误'}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  try {
    return await res.json() as Record<string, unknown>;
  } catch {
    throw new Error('响应解析失败，非有效 JSON');
  }
}

// ─── 发起支付 ────────────────────────────────────────────────────────────────

export async function createPayment(
  config: XunhupayConfig,
  params: CreatePaymentParams,
): Promise<CreatePaymentResponse> {
  const time = Math.floor(Date.now() / 1000).toString();
  const nonce = nonceStr();

  const reqParams: Record<string, string> = {
    version: API_VERSION,
    appid: config.appid,
    trade_order_id: params.trade_order_id,
    total_fee: params.total_fee,
    title: params.title,
    time,
    notify_url: params.notify_url,
    nonce_str: nonce,
  };

  if (params.return_url) reqParams.return_url = params.return_url;
  if (params.callback_url) reqParams.callback_url = params.callback_url;
  if (params.attach) reqParams.attach = params.attach;

  reqParams.hash = generateHash(reqParams, config.appsecret);

  const result = await postJson(`${config.gateway}/payment/do.html`, reqParams);

  return {
    errcode: Number(result.errcode ?? 500),
    errmsg: String(result.errmsg ?? 'unknown error'),
    url_qrcode: result.url_qrcode as string | undefined,
    url: result.url as string | undefined,
    openid: result.openid as string | undefined,
  };
}

// ─── 查询订单 ────────────────────────────────────────────────────────────────

export async function queryPayment(
  config: XunhupayConfig,
  tradeOrderId: string,
): Promise<QueryPaymentResponse> {
  const time = Math.floor(Date.now() / 1000).toString();
  const nonce = nonceStr();

  const reqParams: Record<string, string> = {
    appid: config.appid,
    out_trade_order: tradeOrderId,
    time,
    nonce_str: nonce,
  };

  reqParams.hash = generateHash(reqParams, config.appsecret);

  const result = await postJson(`${config.gateway}/payment/query.html`, reqParams);

  return {
    errcode: Number(result.errcode ?? 500),
    errmsg: String(result.errmsg ?? 'unknown error'),
    data: result.data as QueryPaymentResponse['data'] | undefined,
  };
}

// ─── 退款 ────────────────────────────────────────────────────────────────────

export async function refundPayment(
  config: XunhupayConfig,
  tradeOrderId: string,
  reason?: string,
): Promise<RefundPaymentResponse> {
  const time = Math.floor(Date.now() / 1000).toString();
  const nonce = nonceStr();

  const reqParams: Record<string, string> = {
    appid: config.appid,
    trade_order_id: tradeOrderId,
    time,
    nonce_str: nonce,
  };

  if (reason) reqParams.reason = reason;

  reqParams.hash = generateHash(reqParams, config.appsecret);

  const result = await postJson(`${config.gateway}/payment/refund.html`, reqParams);

  return {
    errcode: Number(result.errcode ?? 500),
    errmsg: String(result.errmsg ?? 'unknown error'),
    trade_order_id: result.trade_order_id as string | undefined,
    refund_fee: result.refund_fee as string | undefined,
    refund_status: result.refund_status as string | undefined,
  };
}
