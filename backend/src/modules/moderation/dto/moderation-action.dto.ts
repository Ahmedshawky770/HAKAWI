import { z } from 'zod';

import { MODERATION_ACTIONS } from './report.dto.ts';

export const ModerationActionResponseDto = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid().optional(),
  adminId: z.string().uuid(),
  action: z.enum(MODERATION_ACTIONS),
  reason: z.string(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  targetUserId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});

export type ModerationActionResponseDto = z.infer<typeof ModerationActionResponseDto>;
