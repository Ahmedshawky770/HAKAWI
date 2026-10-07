import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY, MFA_REQUIRED_KEY } from '../decorators/roles.decorator.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';

import { MfaService } from '../../modules/auth/mfa.service.ts';

@Injectable()
export class MfaGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(MfaService) private readonly mfaService: MfaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const mfaRequired = this.reflector.getAllAndOverride<boolean>(MFA_REQUIRED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!mfaRequired) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request.user;

    if (!user || !user.sub) {
      throw new UnauthorizedException('No authenticated user');
    }

    // Check if MFA is enforced for this user (admin accounts)
    const shouldEnforce = await this.mfaService.shouldEnforceMfa(user.sub);
    if (!shouldEnforce) {
      return true;
    }

    // Check if MFA is enabled
    const mfaEnabled = await this.mfaService.isMfaEnabled(user.sub);
    if (!mfaEnabled) {
      throw new UnauthorizedException({
        message: 'MFA required for this account. Please enable MFA first.',
        code: 'MFA_REQUIRED',
        mfaEnabled: false,
      });
    }

    // Check for MFA challenge in headers (for step-up authentication)
    const mfaToken = request.headers['x-mfa-token'] as string | undefined;
    if (!mfaToken) {
      throw new UnauthorizedException({
        message: 'MFA challenge required. Provide X-MFA-Token header.',
        code: 'MFA_CHALLENGE_REQUIRED',
        mfaEnabled: true,
      });
    }

    // Verify the MFA token
    const result = await this.mfaService.verifyToken(user.sub, mfaToken);
    if (!result.verified) {
      throw new UnauthorizedException({
        message: 'Invalid MFA code',
        code: 'MFA_INVALID_CODE',
      });
    }

    // Attach MFA verification info to request for downstream use
    request.mfaVerified = true;
    request.mfaBackupCodeUsed = result.backupCodeUsed;

    return true;
  }
}