import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  unique,
  integer,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const withdrawals = pgTable(
  'withdrawals',
  {
    id: uuid('id').default(createId()).primaryKey(),
    userId: uuid('user_id').notNull(),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('EGP'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    transactionId: varchar('transaction_id', { length: 255 }).unique(),
    notes: text('notes'),
    requestedAt: timestamp('requested_at').defaultNow().notNull(),
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
