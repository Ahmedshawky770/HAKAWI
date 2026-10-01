import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Request } from '@nestjs/common';

import { RequireAdminRole, RequirePermissions } from '../../common/decorators/roles.decorator.ts';
import { Secured } from '../../common/decorators/secured.decorator.ts';
import { AccountType, AdminRole, adminRoleAtLeast, normalizeAdminRole } from '../../common/constants/roles.ts';
import { Permission } from '../../common/permissions/permissions.ts';
import { parseOrThrow } from '../shared/validation/zod-validation.util.ts';

import { ModerationService } from './moderation.service.ts';
import { AdminDashboardService } from './admin-dashboard.service.ts';
import {
  AdminDashboardStatsDto,
  ReportTrendsQueryDto,
  UserRestrictionsQueryDto,
  ModerationActionsQueryDto,
  type ModerationActionsQueryInput,
  type ReportTrendsQueryInput,
  type UserRestrictionsQueryInput,
} from './dto/admin-dashboard.dto.ts';
import {
  CreateReportDto,
  UpdateReportStatusDto,
  ModerationActionDto,
  ReportQueryDto,
  type ReportQueryInput,
} from './dto/report.dto.ts';

@Controller('moderation')
export class ModerationController {
  constructor(
    @Inject(ModerationService) private readonly moderationService: ModerationService,
    @Inject(AdminDashboardService) private readonly adminDashboardService: AdminDashboardService,
  ) {}

  @Secured()
  @Post('reports')
  @RequirePermissions(Permission.REPORTS_CREATE)
  async createReport(@Request() req: { user: { sub: string } }, @Body() dto: CreateReportDto) {
    return this.moderationService.createReport(req.user.sub, parseOrThrow(CreateReportDto, dto));
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.CONTENT_MODERATOR)
  @RequirePermissions(Permission.REPORTS_VIEW)
  @Get('reports')
  async findAllReports(@Query() query: ReportQueryInput) {
    return this.moderationService.findAllReports(parseOrThrow(ReportQueryDto, query));
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.CONTENT_MODERATOR)
  @RequirePermissions(Permission.REPORTS_UPDATE_ALL)
  @Patch('reports/:id')
  async updateReportStatus(@Param('id') id: string, @Body() dto: UpdateReportStatusDto) {
    return this.moderationService.updateReportStatus(id, parseOrThrow(UpdateReportStatusDto, dto));
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.CONTENT_MODERATOR)
  @RequirePermissions(Permission.ACTIONS_CREATE)
  @Post('reports/:id/actions')
  async takeAction(
    @Param('id') id: string,
    @Request() req: { user: { sub: string } },
    @Body() dto: ModerationActionDto,
  ) {
    return this.moderationService.takeAction(id, req.user.sub, parseOrThrow(ModerationActionDto, dto));
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.STATS_VIEW)
  @Get('stats')
  async getStats(): Promise<AdminDashboardStatsDto> {
    return this.adminDashboardService.getStats();
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.STATS_VIEW)
  @Get('reports/trends')
  async getReportTrends(@Query() query: ReportTrendsQueryInput) {
    return this.adminDashboardService.getReportTrends(parseOrThrow(ReportTrendsQueryDto, query).days);
  }

  @Secured()
  @Get('users/:id/restrictions')
  async getUserRestrictions(
    @Param('id') userId: string,
    @Query() query: UserRestrictionsQueryInput,
    @Request() req: { user: { sub: string; adminRole?: string } },
  ) {
    const isOwn = req.user.sub === userId;
    const isAdmin = this.isModeratorOrSuperAdmin(req.user.adminRole);

    if (!isOwn && !isAdmin) {
      return { restrictions: [] };
    }

    return this.adminDashboardService.getUserRestrictions(
      userId,
      parseOrThrow(UserRestrictionsQueryDto, query).includeExpired,
    );
  }

  @Secured(AccountType.ADMIN)
  @RequireAdminRole(AdminRole.SUPER_ADMIN)
  @RequirePermissions(Permission.ACTIONS_VIEW)
  @Get('actions')
  async getModerationActions(@Query() query: ModerationActionsQueryInput) {
    const parsed = parseOrThrow(ModerationActionsQueryDto, query);
    return this.adminDashboardService.getModerationActions({
      page: parsed.page,
      limit: parsed.limit,
      adminId: parsed.adminId,
      action: parsed.action,
    });
  }

  private isModeratorOrSuperAdmin(adminRole?: string): boolean {
    if (adminRole === undefined) {
      return false;
    }
    const normalized = normalizeAdminRole(adminRole);
    if (normalized === undefined) {
      return false;
    }
    return (
      adminRoleAtLeast(normalized, AdminRole.CONTENT_MODERATOR) || adminRoleAtLeast(normalized, AdminRole.SUPER_ADMIN)
    );
  }
}
