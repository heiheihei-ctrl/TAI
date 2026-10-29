import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
type Request = any;

function cookieExtractor(req: Request, name: string): string | null {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;
  const anyReq: any = req as any;
  const fromCookie = anyReq?.cookies?.[name];
  if (fromCookie) return fromCookie as string;
  return null;
}

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {

  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => cookieExtractor(req, 'refresh_token'),
      ]),
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET') || 'dev-refresh-secret',
      ignoreExpiration: true,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
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
    const refreshToken = cookieExtractor(req, 'refresh_token');
    return { ...payload, refreshToken };
  }
}
