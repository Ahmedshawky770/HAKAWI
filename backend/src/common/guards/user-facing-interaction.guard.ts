import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { normalizeAccountType, AccountType } from '../constants/roles.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';

@Injectable()
export class UserFacingInteractionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (normalizeAccountType(req.user?.accountType ?? '') === AccountType.ADMIN) {
      throw new ForbiddenException('Admin accounts cannot interact with user-facing content');
    }
    return true;
  }
}
