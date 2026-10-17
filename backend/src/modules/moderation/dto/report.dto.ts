import { z } from 'zod';

export const REPORT_TARGET_TYPES = ['story', 'comment', 'user'] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/**
 * The target types a `content_removal` action actually has something to remove.
 *
 * WHY THIS SUBSET IS DATA AND NOT AN `if`. `content_removal` used to be a decision about content
 * that removed nothing: the action row was written and no path anywhere deleted or hid the
 * reported story or comment. Making the producer ask "does this target type have content?" keeps
 * that question in ONE place, next to the vocabulary it is derived from, so the day a third
 * content-bearing target exists — a message, a review — the change is one entry here plus one
 * `@OnEvent('moderation.content.removed')` consumer in the owning module, and nothing in
 * `ModerationService.takeAction` (Principle #8: new behaviour by extension, not by editing the
 * decision).
 *
 * WHY `user` IS ABSENT. A report on an account is not a report on a piece of content: the account
 * itself is what a `ban` or a `mute` acts on, and those already exist and already enforce through
 * the restriction cache. There is no row for a `content_removal` on a `user` target to delete, so
 * emitting an event for one would be a dead letter with nobody to consume it.
 *
 * WHY IT IS TYPED AGAINST `ReportTargetType`. A target type added to `REPORT_TARGET_TYPES` and
 * forgotten here fails to compile rather than becoming a silent no-op removal.
 */
export const CONTENT_BEARING_TARGET_TYPES: readonly ReportTargetType[] = ['story', 'comment'];

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
