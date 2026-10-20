import type { AdminRoleAssignment, NewAdminRoleAssignment } from '../../../db/schema/admin-role-assignments.schema.ts';

export type { AdminRoleAssignment, NewAdminRoleAssignment };

export interface IAdminRolesRepository {
  create(data: NewAdminRoleAssignment): Promise<AdminRoleAssignment>;
  findById(id: string): Promise<AdminRoleAssignment | null>;
  findActiveByUserAndRole(userId: string, adminRole: string): Promise<AdminRoleAssignment | null>;
  findAll(params: {
    userId?: string;
    adminRole?: string;
    assignedBy?: string;
    includeRevoked?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ assignments: AdminRoleAssignment[]; total: number }>;
  revoke(id: string, revokedBy: string, revokeReason: string): Promise<AdminRoleAssignment | null>;
  countByRole(): Promise<Record<string, number>>;
  countExpiringSoon(days: number): Promise<number>;
  countExpired(): Promise<number>;
  findExpired(): Promise<AdminRoleAssignment[]>;
}

export const ADMIN_ROLES_REPOSITORY = 'ADMIN_ROLES_REPOSITORY' as const;