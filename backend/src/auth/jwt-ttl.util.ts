import { UnauthorizedException } from '@nestjs/common';

/** 解析 JWT TTL 字符串（如 900s / 24h / 3d）为毫秒 */
export function parseJwtTtlMs(ttl: string | number | undefined | null, fallback = '3d'): number {
  const raw = ttl == null || ttl === '' ? fallback : ttl;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw * 1000;
  }
  const text = String(raw).trim();
  const m = /^([0-9]+)([smhd])$/i.exec(text);
  if (!m) {
    const n = Number(text);
    return Number.isFinite(n) ? n * 1000 : parseJwtTtlMs(fallback, '3d');
  }
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    case 'd':
      return n * 24 * 60 * 60 * 1000;
    default:
      return n * 1000;
  }
}

/**
 * 对已签发 JWT 强制按新 TTL 截断：即使旧 token 的 exp 更长，
 * 只要 iat 距今超过 maxAgeMs 即视为过期（让历史 token 也按新规）。
 */
export function assertJwtIssuedWithinMaxAge(
  payload: { iat?: number } | null | undefined,
  maxAgeMs: number,
  label = '令牌',
): void {
  const iatSec = typeof payload?.iat === 'number' ? payload.iat : NaN;
  if (!Number.isFinite(iatSec) || iatSec <= 0) {
    throw new UnauthorizedException(`${label}无效`);
  }
  const ageMs = Date.now() - iatSec * 1000;
  if (ageMs > maxAgeMs) {
    throw new UnauthorizedException(`${label}已按新规过期，请重新登录`);
  }
}
