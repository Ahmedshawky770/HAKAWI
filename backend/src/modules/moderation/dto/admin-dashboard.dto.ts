import { z } from 'zod';

import { MODERATION_ACTIONS } from './report.dto.ts';

export const AdminDashboardStatsDto = z.object({
  totalReports: z.number(),
  openReports: z.number(),
  escalatedReports: z.number(),
  inReviewReports: z.number(),
  resolvedReports: z.number(),
  dismissedReports: z.number(),
  totalActions: z.number(),
  totalRestrictions: z.number(),
  activeRestrictions: z.number(),
  avgResolutionMinutes: z.number().nullable(),
});

export type AdminDashboardStatsDto = z.infer<typeof AdminDashboardStatsDto>;

export const ReportTrendsQueryDto = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
});

export type ReportTrendsQueryDto = z.infer<typeof ReportTrendsQueryDto>;

export type ReportTrendsQueryInput = { days?: unknown };

export const UserRestrictionsQueryDto = z.object({
  includeExpired: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .default(false),
});

export type UserRestrictionsQueryDto = z.infer<typeof UserRestrictionsQueryDto>;

export type UserRestrictionsQueryInput = { includeExpired?: unknown };

export const ModerationActionsQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  adminId: z.string().uuid().optional(),
  action: z.enum(MODERATION_ACTIONS).optional(),
});

export type ModerationActionsQueryDto = z.infer<typeof ModerationActionsQueryDto>;

export type ModerationActionsQueryInput = {
  page?: unknown;
  limit?: unknown;
  adminId?: unknown;
  action?: unknown;
};
