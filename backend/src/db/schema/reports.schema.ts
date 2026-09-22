import { pgTable, uuid, varchar, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').default(createId()).primaryKey(),
    reporterId: uuid('reporter_id').notNull(),
    reportedId: uuid('reported_id').notNull(),
    reason: text('reason').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    reporterIdIdx: index('reports_reporter_id_idx').on(table.reporterId),
    reportedIdIdx: index('reports_reported_id_idx').on(table.reportedId),
    statusIdx: index('reports_status_idx').on(table.status),
    createdAtIdx: index('reports_created_at_idx').on(table.createdAt),
  })
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
