import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
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

  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
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

  async validate(req: Request, payload: any) {
    assertJwtIssuedWithinMaxAge(payload, this.refreshMaxAgeMs, '刷新令牌');
    const user = await this.usersService.findAuthUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('刷新令牌无效');
    }
    const invalidatedAt = await this.usersService.getSessionsInvalidatedAt(user.id);
    if (invalidatedAt) {
      const iatSec = typeof payload?.iat === 'number' ? payload.iat : NaN;
      if (!Number.isFinite(iatSec) || iatSec * 1000 < invalidatedAt.getTime()) {
        throw new UnauthorizedException('登录已失效，请重新登录');
      }
    }
    const refreshToken =
      (req as any).cookies?.['refresh_token'] ??
      req.headers?.authorization?.replace(/^Bearer\s+/i, '') ??
      null;
    return { ...payload, refreshToken };
  }
}
