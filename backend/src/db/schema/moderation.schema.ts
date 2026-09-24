import { pgTable, uuid, varchar, text, timestamp, index, integer } from 'drizzle-orm/pg-core';

import { users, stories } from './index.ts';

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    reporterId: uuid('reporter_id').notNull().references(() => users.id),
    targetId: uuid('target_id').notNull(),
    targetType: varchar('target_type', { length: 20 }).notNull(),
    reason: varchar('reason', { length: 500 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    escalatedAt: timestamp('escalated_at'),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    reporterIdx: index('reports_reporter_id_idx').on(table.reporterId),
    targetIdx: index('reports_target_id_idx').on(table.targetId),
    statusIdx: index('reports_status_idx').on(table.status),
    targetTypeIdx: index('reports_target_type_idx').on(table.targetType),
  })
);

export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    reportId: uuid('report_id').references(() => reports.id),
    adminId: uuid('admin_id').notNull().references(() => users.id),
    targetUserId: uuid('target_user_id').references(() => users.id),
    action: varchar('action', { length: 20 }).notNull(),
    reason: varchar('reason', { length: 500 }).notNull(),
    durationMinutes: integer('duration_minutes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    reportIdx: index('moderation_actions_report_id_idx').on(table.reportId),
    adminIdx: index('moderation_actions_admin_id_idx').on(table.adminId),
    targetUserIdx: index('moderation_actions_target_user_id_idx').on(table.targetUserId),
  })
);

export const userRestrictions = pgTable(
  'user_restrictions',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    type: varchar('type', { length: 20 }).notNull(),
    reason: varchar('reason', { length: 500 }).notNull(),
    expiresAt: timestamp('expires_at'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('user_restrictions_user_id_idx').on(table.userId),
    typeIdx: index('user_restrictions_type_idx').on(table.type),
  })
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type ModerationAction = typeof moderationActions.$inferSelect;
export type NewModerationAction = typeof moderationActions.$inferInsert;
export type UserRestriction = typeof userRestrictions.$inferSelect;
export type NewUserRestriction = typeof userRestrictions.$inferInsert;
