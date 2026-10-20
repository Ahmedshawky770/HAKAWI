import { z } from 'zod';
import { AdminRole } from '../../../common/constants/roles.ts';

export const AssignAdminRoleDto = z.object({
  userId: z.string().uuid(),
  adminRole: z.enum(['super_admin', 'content_moderator', 'financial_officer', 'verification_officer']),
  reason: z.string().min(1).max(500),
  expiresAt: z.string().datetime().optional(),
  environment: z.string().optional(),
});

export type AssignAdminRoleInput = z.infer<typeof AssignAdminRoleDto>;

export const RevokeAdminRoleDto = z.object({
  userId: z.string().uuid(),
  adminRole: z.enum(['super_admin', 'content_moderator', 'financial_officer', 'verification_officer']),
  revokeReason: z.string().min(1).max(500),
});

export type RevokeAdminRoleInput = z.infer<typeof RevokeAdminRoleDto>;

export const AdminRoleAssignmentQueryDto = z.object({
  userId: z.string().uuid().optional(),
  adminRole: z.enum(['super_admin', 'content_moderator', 'financial_officer', 'verification_officer']).optional(),
  assignedBy: z.string().uuid().optional(),
  includeRevoked: z.coerce.boolean().default(false),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type AdminRoleAssignmentQueryInput = z.infer<typeof AdminRoleAssignmentQueryDto>;

export const BreakGlassDto = z.object({
  adminRole: z.enum(['super_admin', 'content_moderator', 'financial_officer', 'verification_officer']),
  reason: z.string().min(10).max(500),
  durationMinutes: z.coerce.number().int().positive().max(60).default(15),
});

export type BreakGlassInput = z.infer<typeof BreakGlassDto>;

export interface AdminRoleAssignmentResponse {
  id: string;
  userId: string;
  adminRole: string;
  assignedBy: string;
  assignedByName: string;
  reason: string | null;
  assignedAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedByName: string | null;
  revokeReason: string | null;
  environment: string;
  isActive: boolean;
  expiresAt: string | null;
}

export interface AdminRoleAssignmentsListResponse {
  assignments: AdminRoleAssignmentResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminRoleStatsResponse {
  totalAdmins: number;
  byRole: Record<string, number>;
  expiringSoon: number;
  expired: number;
}

export interface BreakGlassResponse {
  success: boolean;
  adminRole: string;
  expiresAt: string;
  message: string;
}