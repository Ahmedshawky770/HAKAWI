import { z } from 'zod';

export const CreateReportDto = z.object({
  targetId: z.string().uuid(),
  targetType: z.enum(['story', 'comment', 'user']),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must not exceed 500 characters'),
  description: z.string().max(1000, 'Description must not exceed 1000 characters').optional(),
});

export type CreateReportDto = z.infer<typeof CreateReportDto>;

export const UpdateReportStatusDto = z.object({
  status: z.enum(['open', 'in_review', 'resolved', 'dismissed']),
});

export type UpdateReportStatusDto = z.infer<typeof UpdateReportStatusDto>;

export const ModerationActionDto = z.object({
  action: z.enum(['warn', 'mute', 'ban', 'content_removal', 'no_action']),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must not exceed 500 characters'),
  durationMinutes: z.number().int().positive().optional(),
  targetUserId: z.string().uuid().optional(),
});

export type ModerationActionDto = z.infer<typeof ModerationActionDto>;

export const ReportQueryDto = z.object({
  status: z.enum(['open', 'in_review', 'resolved', 'dismissed']).optional(),
  targetType: z.enum(['story', 'comment', 'user']).optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export type ReportQueryDto = z.infer<typeof ReportQueryDto>;
