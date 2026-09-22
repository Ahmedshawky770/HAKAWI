import { pgTable, uuid, varchar, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const moderationLogs = pgTable(
  'moderation_logs',
  {
    id: uuid('id').default(createId()).primaryKey(),
    moderatorId: uuid('moderator_id').notNull(),
    userId: uuid('user_id').notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    reason: text('reason'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    moderatorIdIdx: index('moderation_logs_moderator_id_idx').on(table.moderatorId),
    userIdIdx: index('moderation_logs_user_id_idx').on(table.userId),
    createdAtIdx: index('moderation_logs_created_at_idx').on(table.createdAt),
  })
);

export type ModerationLog = typeof moderationLogs.$inferSelect;
export type NewModerationLog = typeof moderationLogs.$inferInsert;
