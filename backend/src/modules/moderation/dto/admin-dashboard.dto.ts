import { z } from 'zod';

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
  days: z.number().int().positive().max(365).default(30),
});

export type ReportTrendsQueryDto = z.infer<typeof ReportTrendsQueryDto>;

export const UserRestrictionsQueryDto = z.object({
  includeExpired: z.boolean().default(false),
});

export type UserRestrictionsQueryDto = z.infer<typeof UserRestrictionsQueryDto>;

export const ModerationActionsQueryDto = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  adminId: z.string().uuid().optional(),
  action: z.enum(['warn', 'mute', 'ban', 'content_removal', 'no_action']).optional(),
});

export type ModerationActionsQueryDto = z.infer<typeof ModerationActionsQueryDto>;
