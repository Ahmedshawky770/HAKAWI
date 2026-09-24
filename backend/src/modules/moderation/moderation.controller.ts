import { Controller, Post, Get, Patch, Param, Body, Query, UseGuards, Inject, Request } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { RequireAdminRole } from '../../common/decorators/roles.decorator.ts';
import { AdminRole } from '../../common/constants/roles.ts';

import { ModerationService } from './moderation.service.ts';
import { AdminDashboardService } from './admin-dashboard.service.ts';
import { AdminDashboardStatsDto, ReportTrendsQueryDto, UserRestrictionsQueryDto, ModerationActionsQueryDto } from './dto/admin-dashboard.dto.ts';
import { CreateReportDto, UpdateReportStatusDto, ModerationActionDto, ReportQueryDto } from './dto/report.dto.ts';

@Controller('moderation')
export class ModerationController {
  constructor(
    @Inject(ModerationService) private readonly moderationService: ModerationService,
    @Inject(AdminDashboardService) private readonly adminDashboardService: AdminDashboardService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('reports')
  async createReport(@Request() req: { user: { sub: string } }, @Body() dto: CreateReportDto) {
    return this.moderationService.createReport(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('reports')
  async findAllReports(@Query() query: ReportQueryDto) {
    return this.moderationService.findAllReports(query);
  }

  @UseGuards(JwtAuthGuard)
  @RequireAdminRole(AdminRole.MODERATOR)
  @Patch('reports/:id')
  async updateReportStatus(@Param('id') id: string, @Body() dto: UpdateReportStatusDto) {
    return this.moderationService.updateReportStatus(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @RequireAdminRole(AdminRole.MODERATOR)
  @Post('reports/:id/actions')
  async takeAction(@Param('id') id: string, @Request() req: { user: { sub: string } }, @Body() dto: ModerationActionDto) {
    return this.moderationService.takeAction(id, req.user.sub, dto);
  }

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
  async getUserRestrictions(@Param('id') userId: string, @Query() query: UserRestrictionsQueryDto, @Request() req: { user: { sub: string; adminRole: string } }) {
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
