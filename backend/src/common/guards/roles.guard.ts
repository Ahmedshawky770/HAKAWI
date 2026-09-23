import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/roles.decorator.ts';
import { AdminRole, AccountType } from '../constants/roles.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<AccountType[]>(
      'roles',
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const requiredAdminRole = this.reflector.getAllAndOverride<AdminRole>(
      'requiredAdminRole',
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request.user;

    if (!user || !user.accountType) {
      throw new ForbiddenException('Access denied');
    }

    if (requiredAdminRole && user.adminRole !== requiredAdminRole) {
      throw new ForbiddenException('Insufficient admin privileges');
    }

    if (!requiredRoles.includes(user.accountType as AccountType)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
