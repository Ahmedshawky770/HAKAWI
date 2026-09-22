import { pgTable, uuid, varchar, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const withdrawals = pgTable(
  'withdrawals',
  {
    id: uuid('id').default(createId()).primaryKey(),
    userId: uuid('user_id').notNull(),
    amount: varchar('amount', { length: 20 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    method: varchar('method', { length: 50 }).notNull(),
    accountDetails: text('account_details'),
    processedAt: timestamp('processed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('withdrawals_user_id_idx').on(table.userId),
    statusIdx: index('withdrawals_status_idx').on(table.status),
    createdAtIdx: index('withdrawals_created_at_idx').on(table.createdAt),
  })
);

export type Withdrawal = typeof withdrawals.$inferSelect;
export type NewWithdrawal = typeof withdrawals.$inferInsert;
