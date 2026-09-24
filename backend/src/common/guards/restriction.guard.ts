import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ValkeyService } from '../../common/services/valkey.service.ts';

@Injectable()
export class RestrictionGuard implements CanActivate {
  constructor(
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.sub) {
      return true;
    }

    const restrictionKey = `restriction:${user.sub}`;
    const hasRestriction = await this.valkeyService.exists(restrictionKey);

    if (hasRestriction) {
      const restrictionType = await this.valkeyService.get(restrictionKey);
      const restrictionTypeStr = restrictionType || 'restriction';
      const statusCode = restrictionTypeStr === 'ban' ? 403 : 403;
      throw new ForbiddenException({
        statusCode,
        message: `User is ${restrictionTypeStr} and cannot access this resource`,
        type: restrictionTypeStr,
      });
    }

    return true;
  }
}
