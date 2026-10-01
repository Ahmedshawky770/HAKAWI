import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { isSuperAdmin } from '../constants/roles.ts';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../decorators/roles.decorator.ts';
import {
  describePermissionRequirement,
  hasPermission,
  normalizePermissionRequirement,
  resolvePermissions,
} from '../permissions/permissions.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    if (isPublic) {
      return true;
    }

    // Read through the normaliser rather than typing the read, so a route whose metadata is not a
    // well-formed requirement fails loudly here instead of quietly skipping its permission check.
    const requirement = normalizePermissionRequirement(
      this.reflector.getAllAndOverride<unknown>(PERMISSIONS_KEY, targets),
    );
    if (requirement === undefined || requirement.permissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request?.user;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    if (isSuperAdmin(user.accountType, user.adminRole)) {
      return true;
    }

    const granted = resolvePermissions({ accountType: user.accountType, adminRole: user.adminRole });
    if (!hasPermission(granted, requirement)) {
      // The wording reports the mode that was actually applied, so an operator reading a denial is
      // told whether the missing permission had to be satisfied alone or alongside the others.
      throw new ForbiddenException(`Missing required permission: ${describePermissionRequirement(requirement)}`);
    }

    return true;
  }
}
