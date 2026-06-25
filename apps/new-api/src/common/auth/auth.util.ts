import { SetMetadata } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY, REQUIRED_SCOPES_KEY } from '../constants/auth.constants';

export interface AuthenticatedPrincipal {
  tokenId?: string;
  tokenName: string;
  scopes: string[];
  source: 'bootstrap' | 'database';
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function compareTokenHash(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

export function generatePlainToken(prefix = 'na'): string {
  return `${prefix}_${randomBytes(24).toString('hex')}`;
}

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Scopes = (...scopes: string[]) => SetMetadata(REQUIRED_SCOPES_KEY, scopes);
