import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').default(createId()).primaryKey(),
    reporterId: uuid('reporter_id').notNull(),
    targetId: uuid('target_id').notNull(),
    targetType: varchar('target_type', { length: 20 }).notNull(),
    reason: varchar('reason', { length: 100 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: timestamp('resolved_at'),
    resolution: text('resolution'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    reporterIdIdx: index('reports_reporter_id_idx').on(table.reporterId),
    targetIdIdx: index('reports_target_id_idx').on(table.targetId),
    statusIdx: index('reports_status_idx').on(table.status),
    createdAtIdx: index('reports_created_at_idx').on(table.createdAt),
    reporterTargetTypeUnique: unique('reports_reporter_id_target_id_target_type_key').on(table.reporterId, table.targetId, table.targetType),
  })
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
