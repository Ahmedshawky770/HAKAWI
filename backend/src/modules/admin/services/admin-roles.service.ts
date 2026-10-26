import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import {
  AdminRoleAssignedEvent,
  AdminRoleBreakGlassEvent,
  AdminRoleRevokedEvent,
} from '../../../common/events/admin.events.ts';
import { UsersService } from '../../users/users.service.ts';
import { AccountType, AdminRole, isAdminRole } from '../../../common/constants/roles.ts';
import { parseOrThrow } from '../../shared/validation/zod-validation.util.ts';

import type { IAdminRolesRepository } from '../interfaces/admin-roles-repository.interface.ts';
import { ADMIN_ROLES_REPOSITORY } from '../interfaces/admin-roles-repository.interface.ts';
import type { AdminRoleAssignment } from '../../../db/schema/admin-role-assignments.schema.ts';

import {
  AssignAdminRoleDto,
  RevokeAdminRoleDto,
  AdminRoleAssignmentQueryDto,
  BreakGlassDto,
  type AssignAdminRoleInput,
  type RevokeAdminRoleInput,
  type AdminRoleAssignmentQueryInput,
  type BreakGlassInput,
  type AdminRoleAssignmentResponse,
  type AdminRoleAssignmentsListResponse,
  type AdminRoleStatsResponse,
  type BreakGlassResponse,
} from '../dto/admin-roles.dto.ts';

const DEFAULT_EXPIRY_DAYS = 365;
const EXPIRY_WARNING_DAYS = 30;

@Injectable()
export class AdminRolesService {
  constructor(
    @Inject(ADMIN_ROLES_REPOSITORY) private readonly adminRolesRepository: IAdminRolesRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleExpiredRoles(): Promise<void> {
    this.logger.info('Running scheduled expired admin roles cleanup', 'AdminRolesService');
    try {
      const expiredCount = await this.expireRoles();
      if (expiredCount > 0) {
        this.logger.warn(`Scheduled cleanup: auto-expired ${expiredCount} admin roles`, 'AdminRolesService');
      }
    } catch (error) {
      this.logger.error(`Scheduled expired roles cleanup failed: ${error}`, 'AdminRolesService');
    }
  }

  async assignRole(assignedById: string, dto: AssignAdminRoleInput): Promise<AdminRoleAssignmentResponse> {
    const input = parseOrThrow(AssignAdminRoleDto, dto);

    if (!isAdminRole(input.adminRole)) {
      throw new BadRequestException('Invalid admin role');
    }

    const targetUser = await this.usersService.findById(input.userId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.accountType !== AccountType.ADMIN) {
      throw new BadRequestException('Target user must have account type "admin" to receive admin role');
    }

    const existing = await this.adminRolesRepository.findActiveByUserAndRole(input.userId, input.adminRole);
    if (existing) {
      throw new ConflictException(`User already has active ${input.adminRole} role`);
    }

    if (input.adminRole === AdminRole.SUPER_ADMIN) {
      const superAdminCount = (await this.adminRolesRepository.countByRole())[AdminRole.SUPER_ADMIN] ?? 0;
      if (superAdminCount >= 5) {
        throw new BadRequestException('Maximum number of super admins (5) reached');
      }
    }

    const environment = input.environment ?? this.configService.get<string>('app.environment') ?? 'production';

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) {
      throw new BadRequestException('expiresAt must be a valid future date');
    }
    const MAX_EXPIRY_DAYS = 365;
    const requestedDays = expiresAt ? (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000) : DEFAULT_EXPIRY_DAYS;
    if (requestedDays > MAX_EXPIRY_DAYS) {
      throw new BadRequestException(`expiresAt cannot exceed ${MAX_EXPIRY_DAYS} days from now`);
    }
    const finalExpiresAt = expiresAt ?? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const assignment = await this.adminRolesRepository.create({
      userId: input.userId,
      adminRole: input.adminRole,
      assignedBy: assignedById,
      reason: input.reason,
      environment,
      expiresAt: finalExpiresAt,
    });

    await this.usersService.update(input.userId, {
      adminRole: input.adminRole,
      adminRoleExpiresAt: finalExpiresAt,
    });

    // The event is CONSTRUCTED, not cast. The payload used to be an object
    // literal told to be an `AdminRoleAssignmentEvent` with `as`, which is a
    // promise the compiler cannot check: the break-glass payload was cast to
    // the same union even though it matched neither member. Constructing the
    // event makes the producer and the schema two views of ONE fact, and a
    // field that the schema requires and the producer forgets is a compile
    // error instead of a dead-lettered event.
    await this.eventBus.emit(
      'admin_role.assigned',
      new AdminRoleAssignedEvent(input.userId, input.adminRole, assignedById, input.reason, finalExpiresAt.toISOString()),
    );

    this.logger.info(`Assigned ${input.adminRole} to user ${input.userId} by ${assignedById}`, 'AdminRolesService');

    return this.mapToResponse(assignment, targetUser.name);
  }

  async revokeRole(revokedById: string, dto: RevokeAdminRoleInput): Promise<AdminRoleAssignmentResponse> {
    const input = parseOrThrow(RevokeAdminRoleDto, dto);

    if (!isAdminRole(input.adminRole)) {
      throw new BadRequestException('Invalid admin role');
    }

    const activeAssignment = await this.adminRolesRepository.findActiveByUserAndRole(input.userId, input.adminRole);
    if (!activeAssignment) {
      throw new NotFoundException('Active admin role assignment not found');
    }

    const revoked = await this.adminRolesRepository.revoke(activeAssignment.id, revokedById, input.revokeReason);
    if (!revoked) {
      throw new NotFoundException('Failed to revoke admin role');
    }

    const remainingRoles = await this.getUserActiveRoles(input.userId);
    const newAdminRole = remainingRoles.length > 0 ? remainingRoles[0] : null;

    await this.usersService.update(input.userId, {
      adminRole: newAdminRole,
      adminRoleExpiresAt: newAdminRole ? await this.getRoleExpiry(input.userId, newAdminRole) : null,
    });

    await this.eventBus.emit(
      'admin_role.revoked',
      new AdminRoleRevokedEvent(input.userId, input.adminRole, revokedById, input.revokeReason),
    );

    this.logger.info(`Revoked ${input.adminRole} from user ${input.userId} by ${revokedById}`, 'AdminRolesService');

    const targetUser = await this.usersService.findById(input.userId);
    return this.mapToResponse(revoked, targetUser?.name ?? 'Unknown');
  }

  async getAssignments(query: AdminRoleAssignmentQueryInput): Promise<AdminRoleAssignmentsListResponse> {
    const parsed = parseOrThrow(AdminRoleAssignmentQueryDto, query);
    const result = await this.adminRolesRepository.findAll({
      userId: parsed.userId,
      adminRole: parsed.adminRole,
      assignedBy: parsed.assignedBy,
      includeRevoked: parsed.includeRevoked,
      page: parsed.page,
      limit: parsed.limit,
    });

    const userIds = [...new Set(result.assignments.map((a) => a.assignedBy).concat(result.assignments.map((a) => a.revokedBy).filter((r): r is string => r !== null)))];
    const users = await this.usersService.findByIds(userIds);
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return {
      assignments: result.assignments.map((a) => this.mapToResponse(a, userMap.get(a.assignedBy) ?? 'Unknown', userMap.get(a.revokedBy ?? '') ?? undefined)),
      total: result.total,
      page: parsed.page,
      limit: parsed.limit,
    };
  }

  async getStats(): Promise<AdminRoleStatsResponse> {
    const byRole = await this.adminRolesRepository.countByRole();
    const totalAdmins = Object.values(byRole).reduce((sum, count) => sum + count, 0);
    const expiringSoon = await this.adminRolesRepository.countExpiringSoon(EXPIRY_WARNING_DAYS);
    const expired = await this.adminRolesRepository.countExpired();

    return {
      totalAdmins,
      byRole,
      expiringSoon,
      expired,
    };
  }

  async expireRoles(): Promise<number> {
    const expiredAssignments = await this.adminRolesRepository.findExpired();
    let expiredCount = 0;

    for (const assignment of expiredAssignments) {
      await this.revokeRole('system', {
        userId: assignment.userId,
        adminRole: assignment.adminRole as AdminRole,
        revokeReason: 'Role expired automatically',
      });
      expiredCount++;
    }

    if (expiredCount > 0) {
      this.logger.warn(`Auto-expired ${expiredCount} admin roles`, 'AdminRolesService');
    }

    return expiredCount;
  }

  private async getUserActiveRoles(userId: string): Promise<string[]> {
    const result = await this.adminRolesRepository.findAll({
      userId,
      includeRevoked: false,
      limit: 100,
    });
    return result.assignments.map((a) => a.adminRole);
  }

  private async getRoleExpiry(userId: string, adminRole: string): Promise<Date | null> {
    const result = await this.adminRolesRepository.findAll({
      userId,
      adminRole,
      includeRevoked: false,
      limit: 1,
    });
    if (result.assignments.length > 0 && result.assignments[0].revokedAt === null) {
      return result.assignments[0].expiresAt ? new Date(result.assignments[0].expiresAt) : null;
    }
    return null;
  }

  private mapToResponse(assignment: AdminRoleAssignment, assignedByName: string, revokedByName?: string): AdminRoleAssignmentResponse {
    return {
      id: assignment.id,
      userId: assignment.userId,
      adminRole: assignment.adminRole,
      assignedBy: assignment.assignedBy,
      assignedByName,
      reason: assignment.reason,
      assignedAt: assignment.assignedAt.toISOString(),
      revokedAt: assignment.revokedAt ? assignment.revokedAt.toISOString() : null,
      revokedBy: assignment.revokedBy ?? null,
      revokedByName: revokedByName ?? null,
      revokeReason: assignment.revokeReason ?? null,
      environment: assignment.environment,
      isActive: assignment.revokedAt === null && assignment.expiresAt !== null && assignment.expiresAt !== undefined && new Date(assignment.expiresAt) > new Date(),
      expiresAt: assignment.expiresAt ? assignment.expiresAt.toISOString() : null,
    };
  }

  async breakGlass(userId: string, dto: BreakGlassInput): Promise<BreakGlassResponse> {
    if (!isAdminRole(dto.adminRole)) {
      throw new BadRequestException('Invalid admin role');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.accountType !== AccountType.ADMIN) {
      throw new BadRequestException('User must have account type "admin" to use break-glass');
    }

    if (user.adminRole === AdminRole.SUPER_ADMIN) {
      throw new BadRequestException('Super admins do not need break-glass access');
    }

    const existing = await this.adminRolesRepository.findActiveByUserAndRole(userId, dto.adminRole);
    if (existing) {
      throw new ConflictException(`User already has active ${dto.adminRole} role`);
    }

    const environment = this.configService.get<string>('app.environment') ?? 'production';
    if (dto.durationMinutes < 1 || dto.durationMinutes > 240) {
      throw new BadRequestException('durationMinutes must be between 1 and 240');
    }
    const expiresAt = new Date(Date.now() + dto.durationMinutes * 60 * 1000);

    const assignment = await this.adminRolesRepository.create({
      userId,
      adminRole: dto.adminRole,
      assignedBy: userId,
      reason: `BREAK-GLASS: ${dto.reason}`,
      environment,
      expiresAt,
    });

    await this.usersService.update(userId, {
      adminRole: dto.adminRole,
      adminRoleExpiresAt: expiresAt,
    });

    await this.eventBus.emit(
      'admin_role.break_glass',
      new AdminRoleBreakGlassEvent(
        userId,
        dto.adminRole,
        userId,
        dto.reason,
        expiresAt.toISOString(),
        dto.durationMinutes,
      ),
    );

    this.logger.warn(`BREAK-GLASS activated: user ${userId} granted ${dto.adminRole} for ${dto.durationMinutes} minutes. Reason: ${dto.reason}`, 'AdminRolesService');

    return {
      success: true,
      adminRole: dto.adminRole,
      expiresAt: expiresAt.toISOString(),
      message: `Break-glass access granted for ${dto.durationMinutes} minutes. This action has been logged and will auto-expire.`,
    };
  }
}