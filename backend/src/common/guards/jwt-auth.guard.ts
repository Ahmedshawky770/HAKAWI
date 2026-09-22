import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/roles.decorator.js';
import { JwtPayload } from '../utils/jwt.util.js';
import { AuthRequest } from '../types/auth-request.interface.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context) as boolean;
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }

  getRequest(context: ExecutionContext): AuthRequest {
    return context.switchToHttp().getRequest<AuthRequest>();
  }
}
