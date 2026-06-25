import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { REQUIRED_SCOPES_KEY, IS_PUBLIC_KEY } from '../constants/auth.constants';
import { AppException } from '../errors/app.exception';
import { AuthService } from '../../modules/auth/auth.service';
import { AuthenticatedPrincipal } from './auth.util';

type AuthenticatedRequest = Request & {
  principal?: AuthenticatedPrincipal;
};

@Injectable()
export class BearerTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.header('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppException('AUTH_MISSING_BEARER_TOKEN', 'Bearer token is required', 401);
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new AppException('AUTH_INVALID_TOKEN', 'Bearer token is required', 401);
    }

    const principal = await this.authService.validateBearerToken(token);
    request.principal = principal;

    const requiredScopes =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (
      requiredScopes.length > 0 &&
      !requiredScopes.every((scope) => principal.scopes.includes(scope))
    ) {
      throw new AppException('AUTH_SCOPE_FORBIDDEN', 'Token scope is insufficient', 403, {
        requiredScopes,
      });
    }

    return true;
  }
}
