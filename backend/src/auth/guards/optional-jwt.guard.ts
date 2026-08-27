import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * 有 token 则解析用户；无 token / 无效 token 不抛错，继续匿名访问。
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
  ): TUser | null {
    if (err || !user) {
      return null;
    }
    return user;
  }
}
