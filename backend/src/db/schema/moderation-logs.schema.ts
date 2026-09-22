import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const moderationLogs = pgTable(
  'moderation_logs',
  {
    id: uuid('id').default(createId()).primaryKey(),
    moderatorId: uuid('moderator_id').notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    targetId: uuid('target_id').notNull(),
    targetType: varchar('target_type', { length: 20 }).notNull(),
    reason: text('reason').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    moderatorIdIdx: index('moderation_logs_moderator_id_idx').on(table.moderatorId),
    targetIdIdx: index('moderation_logs_target_id_idx').on(table.targetId),
    createdAtIdx: index('moderation_logs_created_at_idx').on(table.createdAt),
  })
);

export type ModerationLog = typeof moderationLogs.$inferSelect;
export type NewModerationLog = typeof moderationLogs.$inferInsert;
