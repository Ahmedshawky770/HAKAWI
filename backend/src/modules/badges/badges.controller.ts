import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { RequireAdminRole, RequirePermissions } from '../../common/decorators/roles.decorator.ts';
import { Secured } from '../../common/decorators/secured.decorator.ts';
import { AccountType, AdminRole } from '../../common/constants/roles.ts';
import { Permission } from '../../common/permissions/permissions.ts';

import { BadgesService } from './badges.service.ts';
import { AwardBadgeDto, ListBadgesQueryDto } from './dto/badges.dto.ts';

@Controller('badges')
export class BadgesController {
  constructor(@Inject(BadgesService) private readonly badgesService: BadgesService) {}

  @Secured()
  @Get()
  async listCatalog() {
    return this.badgesService.listCatalog();
  }

  @Secured()
  @Get('users/:userId')
  async findForUser(@Param('userId', ParseUUIDPipe) userId: string, @Query() query: ListBadgesQueryDto) {
    if (query.key === undefined) {
      return this.badgesService.findByUser(userId);
    }
    return this.badgesService.findByUserAndKey(userId, query.key);
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.ACTIONS_CREATE)
  @Post('users/:userId')
  async award(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: AwardBadgeDto) {
    return this.badgesService.awardManual(userId, dto.badgeKey);
  }
}
