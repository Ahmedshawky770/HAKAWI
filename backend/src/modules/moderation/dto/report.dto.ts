import { z } from 'zod';

export const REPORT_TARGET_TYPES = ['story', 'comment', 'user'] as const;

export const REPORT_STATUSES = ['open', 'in_review', 'escalated', 'resolved', 'dismissed'] as const;

export const MODERATION_ACTIONS = ['warn', 'mute', 'ban', 'content_removal', 'no_action'] as const;

export const CreateReportDto = z.object({
  targetId: z.string().uuid(),
  targetType: z.enum(REPORT_TARGET_TYPES),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must not exceed 500 characters'),
  description: z.string().max(1000, 'Description must not exceed 1000 characters').optional(),
});

export type CreateReportDto = z.infer<typeof CreateReportDto>;

export const CreateReportInput = CreateReportDto;

export const UpdateReportStatusDto = z.object({
  status: z.enum(REPORT_STATUSES),
});

export type UpdateReportStatusDto = z.infer<typeof UpdateReportStatusDto>;

export const ModerationActionDto = z.object({
  action: z.enum(MODERATION_ACTIONS),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must not exceed 500 characters'),
  durationMinutes: z.number().int().positive().optional(),
  targetUserId: z.string().uuid().optional(),
});

export type ModerationActionDto = z.infer<typeof ModerationActionDto>;

export const ReportQueryDto = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  targetType: z.enum(REPORT_TARGET_TYPES).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ReportQueryDto = z.infer<typeof ReportQueryDto>;

export type ReportQueryInput = {
  status?: unknown;
  targetType?: unknown;
  page?: unknown;
  limit?: unknown;
};
