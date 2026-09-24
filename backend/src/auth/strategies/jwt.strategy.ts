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
  const fromHeader = req.headers?.authorization?.replace('Bearer ', '') ?? null;
  return fromHeader || null;
}

function assertNotForceLoggedOut(payload: any, sessionsInvalidatedAt?: Date | null) {
  if (!sessionsInvalidatedAt) return;
  const iatSec = typeof payload?.iat === 'number' ? payload.iat : NaN;
  if (!Number.isFinite(iatSec)) {
    throw new UnauthorizedException('访问令牌无效');
  }
  if (iatSec * 1000 < sessionsInvalidatedAt.getTime()) {
    throw new UnauthorizedException('登录已失效，请重新登录');
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly accessMaxAgeMs: number;

  constructor(
    private config: ConfigService,
    private usersService: UsersService,
  ) {
    const secret = config.get<string>('JWT_ACCESS_SECRET') || 'dev-access-secret';
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => cookieExtractor(req, 'access_token'),
      ]),
      secretOrKey: secret,
      ignoreExpiration: false,
    });
    this.accessMaxAgeMs = parseJwtTtlMs(config.get<string>('JWT_ACCESS_TTL'), '7d');
  }

  async validate(payload: any) {
    assertJwtIssuedWithinMaxAge(payload, this.accessMaxAgeMs, '访问令牌');
    // 获取完整用户信息
    const user = await this.usersService.findAuthUserById(payload.sub);
    if (!user) return null;
    const sessionsInvalidatedAt = await this.usersService.getSessionsInvalidatedAt(user.id);
    assertNotForceLoggedOut(payload, sessionsInvalidatedAt);
    void this.usersService.touchLastLoginAt(user.id).catch(() => undefined);
    const result = {
      sub: user.id,  // 标准JWT字段
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt?.toISOString?.() ?? user.createdAt,
    };
    console.log('JWT validate result:', result);
    return result;
  }
}
