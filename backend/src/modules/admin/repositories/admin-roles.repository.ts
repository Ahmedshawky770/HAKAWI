import { Injectable, Inject } from '@nestjs/common';
import { eq, and, isNull, desc, count, sql, or } from 'drizzle-orm';

import { adminRoleAssignments } from '../../../db/schema/admin-role-assignments.schema.ts';
import { users } from '../../../db/schema/users.schema.ts';
import { db } from '../../../db/index.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

import type {
  IAdminRolesRepository,
  AdminRoleAssignment,
  NewAdminRoleAssignment,
} from '../interfaces/admin-roles-repository.interface.ts';
import { ADMIN_ROLES_REPOSITORY } from '../interfaces/admin-roles-repository.interface.ts';

@Injectable()
export class AdminRolesRepository implements IAdminRolesRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async create(data: NewAdminRoleAssignment): Promise<AdminRoleAssignment> {
    this.logger.info(`Creating admin role assignment for user ${data.userId} as ${data.adminRole}`, 'AdminRolesRepository');
    const [assignment] = await db.insert(adminRoleAssignments).values(data).returning();
    return assignment;
  }

  async findById(id: string): Promise<AdminRoleAssignment | null> {
    const [assignment] = await db.select().from(adminRoleAssignments).where(eq(adminRoleAssignments.id, id)).limit(1);
    return assignment ?? null;
  }

  async findActiveByUserAndRole(userId: string, adminRole: string): Promise<AdminRoleAssignment | null> {
    const [assignment] = await db
      .select()
      .from(adminRoleAssignments)
      .where(
        and(
          eq(adminRoleAssignments.userId, userId),
          eq(adminRoleAssignments.adminRole, adminRole),
          isNull(adminRoleAssignments.revokedAt),
        ),
      )
      .limit(1);
    return assignment ?? null;
  }

  async findAll(params: {
    userId?: string;
    adminRole?: string;
    assignedBy?: string;
    includeRevoked?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ assignments: AdminRoleAssignment[]; total: number }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (params.userId) {
      conditions.push(eq(adminRoleAssignments.userId, params.userId));
    }
    if (params.adminRole) {
      conditions.push(eq(adminRoleAssignments.adminRole, params.adminRole));
    }
    if (params.assignedBy) {
      conditions.push(eq(adminRoleAssignments.assignedBy, params.assignedBy));
    }
    if (!params.includeRevoked) {
      conditions.push(isNull(adminRoleAssignments.revokedAt));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [assignmentsResult, [{ total }]] = await Promise.all([
      db
        .select()
        .from(adminRoleAssignments)
        .where(whereClause)
        .orderBy(desc(adminRoleAssignments.assignedAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(adminRoleAssignments).where(whereClause),
    ]);

    return { assignments: assignmentsResult, total: Number(total) };
  }

  async revoke(id: string, revokedBy: string, revokeReason: string): Promise<AdminRoleAssignment | null> {
    const [revoked] = await db
      .update(adminRoleAssignments)
      .set({
        revokedAt: new Date(),
        revokedBy,
        revokeReason,
      })
      .where(eq(adminRoleAssignments.id, id))
      .returning();
    return revoked ?? null;
  }

  async countByRole(): Promise<Record<string, number>> {
    const results = await db
      .select({
        adminRole: adminRoleAssignments.adminRole,
        total: count(),
      })
      .from(adminRoleAssignments)
      .where(isNull(adminRoleAssignments.revokedAt))
      .groupBy(adminRoleAssignments.adminRole);

    return results.reduce((acc, row) => {
      acc[row.adminRole] = Number(row.total);
      return acc;
    }, {} as Record<string, number>);
  }

  async countExpiringSoon(days: number): Promise<number> {
    const threshold = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const [result] = await db
      .select({ total: count() })
      .from(adminRoleAssignments)
      .where(
        and(
          isNull(adminRoleAssignments.revokedAt),
          sql`${adminRoleAssignments.expiresAt} IS NOT NULL`,
          sql`${adminRoleAssignments.expiresAt} <= ${threshold}`,
          sql`${adminRoleAssignments.expiresAt} > now()`,
        ),
      );
    return Number(result?.total ?? 0);
  }

  async countExpired(): Promise<number> {
    const [result] = await db
      .select({ total: count() })
      .from(adminRoleAssignments)
      .where(
        and(
          isNull(adminRoleAssignments.revokedAt),
          sql`${adminRoleAssignments.expiresAt} IS NOT NULL`,
          sql`${adminRoleAssignments.expiresAt} <= now()`,
        ),
      );
    return Number(result?.total ?? 0);
  }

  async findExpired(): Promise<AdminRoleAssignment[]> {
    return db
      .select()
      .from(adminRoleAssignments)
      .where(
        and(
          isNull(adminRoleAssignments.revokedAt),
          sql`${adminRoleAssignments.expiresAt} IS NOT NULL`,
          sql`${adminRoleAssignments.expiresAt} <= now()`,
        ),
      );
  }
}