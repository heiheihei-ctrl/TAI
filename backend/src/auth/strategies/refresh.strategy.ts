import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { assertJwtIssuedWithinMaxAge, parseJwtTtlMs } from '../jwt-ttl.util';
type Request = any;

function cookieExtractor(req: Request, name: string): string | null {
  const anyReq: any = req as any;
  const fromCookie = anyReq?.cookies?.[name];
  if (fromCookie) return fromCookie as string;
  const fromHeader = req.headers?.authorization?.replace(/^Bearer\s+/i, '') ?? null;
  return fromHeader || null;
}

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  private readonly refreshMaxAgeMs: number;

  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => cookieExtractor(req, 'refresh_token'),
      ]),
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET') || 'dev-refresh-secret',
      ignoreExpiration: false,
      passReqToCallback: true,
    });
    this.refreshMaxAgeMs = parseJwtTtlMs(config.get<string>('JWT_REFRESH_TTL'), '3d');
  }

  validate(req: Request, payload: any) {
    assertJwtIssuedWithinMaxAge(payload, this.refreshMaxAgeMs, '刷新令牌');
    const refreshToken =
      (req as any).cookies?.['refresh_token'] ??
      req.headers?.authorization?.replace(/^Bearer\s+/i, '') ??
      null;
    return { ...payload, refreshToken };
  }
}
