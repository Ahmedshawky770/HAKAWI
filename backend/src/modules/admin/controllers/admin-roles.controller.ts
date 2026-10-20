import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Request } from '@nestjs/common';

import { Secured } from '../../../common/decorators/secured.decorator.ts';
import { RequireAdminRole, RequirePermissions, RequireMfa } from '../../../common/decorators/roles.decorator.ts';
import { AccountType, AdminRole } from '../../../common/constants/roles.ts';
import { Permission } from '../../../common/permissions/permissions.ts';
import { parseOrThrow } from '../../shared/validation/zod-validation.util.ts';

import { AdminRolesService } from '../services/admin-roles.service.ts';
import {
  AssignAdminRoleDto,
  RevokeAdminRoleDto,
  AdminRoleAssignmentQueryDto,
  BreakGlassDto,
  type AssignAdminRoleInput,
  type RevokeAdminRoleInput,
  type AdminRoleAssignmentQueryInput,
  type BreakGlassInput,
  type AdminRoleAssignmentsListResponse,
  type AdminRoleAssignmentResponse,
  type AdminRoleStatsResponse,
  type BreakGlassResponse,
} from '../dto/admin-roles.dto.ts';

@Controller('admin/roles')
@Secured(AccountType.ADMIN)
@RequireAdminRole(AdminRole.SUPER_ADMIN)
export class AdminRolesController {
  constructor(@Inject(AdminRolesService) private readonly adminRolesService: AdminRolesService) {}

  @RequirePermissions(Permission.USERS_MANAGE_ALL)
  @Post('assign')
  async assignRole(
    @Request() req: { user: { sub: string } },
    @Body() dto: AssignAdminRoleInput,
  ): Promise<AdminRoleAssignmentResponse> {
    return this.adminRolesService.assignRole(req.user.sub, parseOrThrow(AssignAdminRoleDto, dto));
  }

  @RequirePermissions(Permission.USERS_MANAGE_ALL)
  @Delete('revoke')
  async revokeRole(
    @Request() req: { user: { sub: string } },
    @Body() dto: RevokeAdminRoleInput,
  ): Promise<AdminRoleAssignmentResponse> {
    return this.adminRolesService.revokeRole(req.user.sub, parseOrThrow(RevokeAdminRoleDto, dto));
  }

  @RequirePermissions(Permission.USERS_READ)
  @Get()
  async getAssignments(@Query() query: AdminRoleAssignmentQueryInput): Promise<AdminRoleAssignmentsListResponse> {
    return this.adminRolesService.getAssignments(parseOrThrow(AdminRoleAssignmentQueryDto, query));
  }

  @RequirePermissions(Permission.STATS_VIEW)
  @Get('stats')
  async getStats(): Promise<AdminRoleStatsResponse> {
    return this.adminRolesService.getStats();
  }

  @RequirePermissions(Permission.USERS_MANAGE_ALL)
  @RequireMfa()
  @Post('break-glass')
  async breakGlass(
    @Request() req: { user: { sub: string } },
    @Body() dto: BreakGlassInput,
  ): Promise<BreakGlassResponse> {
    return this.adminRolesService.breakGlass(req.user.sub, parseOrThrow(BreakGlassDto, dto));
  }
}