import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  accountTypeSatisfies,
  adminRoleAtLeast,
  normalizeAccountType,
  normalizeAdminRole,
} from '../constants/roles.ts';
import { IS_PUBLIC_KEY, REQUIRED_ADMIN_ROLE_KEY, REQUIRED_ROLES_KEY } from '../decorators/roles.decorator.ts';
import type { AccountType, AdminRole } from '../constants/roles.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<readonly AccountType[]>(REQUIRED_ROLES_KEY, targets);
    const requiredAdminRole = this.reflector.getAllAndOverride<AdminRole | undefined>(REQUIRED_ADMIN_ROLE_KEY, targets);

    const hasRoleRequirement = requiredRoles !== undefined && requiredRoles.length > 0;
    if (!hasRoleRequirement && requiredAdminRole === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request?.user;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    if (requiredAdminRole !== undefined) {
      const adminRole = typeof user.adminRole === 'string' ? normalizeAdminRole(user.adminRole) : undefined;
      if (adminRole === undefined || !adminRoleAtLeast(adminRole, requiredAdminRole)) {
        throw new ForbiddenException('Insufficient admin privileges');
      }
    }

    if (hasRoleRequirement) {
      if (typeof user.accountType !== 'string') {
        throw new ForbiddenException('Access denied');
      }
      const accountType = normalizeAccountType(user.accountType);
      if (!accountTypeSatisfies(accountType, requiredRoles)) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return true;
  }
}
