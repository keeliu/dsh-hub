/**
 * DSH Hub · 密码哈希（M1）
 *
 * 零依赖实现：Node 内置 `crypto.scrypt`（内存硬函数）。
 * 计划文档原写 argon2id；零依赖约束下用 scrypt（N=2^15, r=8, p=1, 64MiB maxmem，
 * 高于 Node 默认 32MiB），并将「换 argon2id」记为 M5 加固项（npm 可达时可引入 argon2 包）。
 *
 * 自描述格式：`scrypt$N$r$p$maxmem$<saltB64>$<hashB64>`（便于将来升级算法/参数）。
 */
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export const SCRYPT_N = 32768;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_MAXMEM = 64 * 1024 * 1024; // N*128*r ≈ 33.5MiB，留余量
const KEYLEN = 32;
const SALTLEN = 16;

/**
 * 恒定耗时占位哈希（M2.1）：登录时「用户不存在」路径也执行一次同参数 scrypt，
 * 消除基于响应时间差的用户名枚举侧信道。
 */
export const DUMMY_HASH = hashPassword('dsh-hub-dummy-verification-key');

export function hashPassword(password: string): string {
  const salt = randomBytes(SALTLEN);
  const key = scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_MAXMEM, salt.toString('base64'), key.toString('base64')].join('$');
}

/** 校验密码；未知/损坏格式一律 false（不抛错，避免把内部状态泄露给调用方）。 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = String(stored ?? '').split('$');
  if (parts[0] !== 'scrypt' || parts.length !== 7) return false;
  const N = Number(parts[1] ?? NaN);
  const r = Number(parts[2] ?? NaN);
  const p = Number(parts[3] ?? NaN);
  const maxmem = Number(parts[4] ?? NaN);
  if (![N, r, p, maxmem].every(Number.isFinite) || N <= 0 || r <= 0 || p <= 0 || maxmem <= 0) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[5] ?? '', 'base64');
    expected = Buffer.from(parts[6] ?? '', 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length, { N, r, p, maxmem });
  return timingSafeEqual(actual, expected);
}