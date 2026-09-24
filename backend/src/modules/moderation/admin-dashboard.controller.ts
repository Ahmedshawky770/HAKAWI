import { Controller, Get, Param, Query, UseGuards, Inject, Request } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { RequireAdminRole } from '../../common/decorators/roles.decorator.ts';
import { AdminRole, AccountType } from '../../common/constants/roles.ts';

import { AdminDashboardService } from './admin-dashboard.service.ts';
import { AdminDashboardStatsDto, ReportTrendsQueryDto, UserRestrictionsQueryDto, ModerationActionsQueryDto } from './dto/admin-dashboard.dto.ts';

interface AdminRequest extends Request {
  user: { sub: string; accountType: string; adminRole?: string };
}

@Controller('moderation')
export class AdminDashboardController {
  constructor(@Inject(AdminDashboardService) private readonly adminDashboardService: AdminDashboardService) {}

  @UseGuards(JwtAuthGuard)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  @Get('stats')
  async getStats(@Request() req: { user: { sub: string } }): Promise<AdminDashboardStatsDto> {
    return this.adminDashboardService.getStats();
  }

  @UseGuards(JwtAuthGuard)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  @Get('reports/trends')
  async getReportTrends(@Query() query: ReportTrendsQueryDto) {
    return this.adminDashboardService.getReportTrends(query.days);
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/:id/restrictions')
  async getUserRestrictions(@Param('id') userId: string, @Query() query: UserRestrictionsQueryDto, @Request() req: AdminRequest) {
    const isOwn = req.user.sub === userId;
    const isAdmin = req.user.adminRole === AdminRole.SUPER_ADMIN || req.user.adminRole === AdminRole.MODERATOR;

    if (!isOwn && !isAdmin) {
      return { restrictions: [] };
    }

    return this.adminDashboardService.getUserRestrictions(userId, query.includeExpired);
  }

  @UseGuards(JwtAuthGuard)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  @Get('actions')
  async getModerationActions(@Query() query: ModerationActionsQueryDto) {
    return this.adminDashboardService.getModerationActions({
      page: query.page,
      limit: query.limit,
      adminId: query.adminId,
      action: query.action,
    });
  }
}
