import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const prizeTransactions = pgTable(
  'prize_transactions',
  {
    id: uuid('id').default(createId()).primaryKey(),
    contestId: uuid('contest_id').notNull(),
    userId: uuid('user_id').notNull(),
    amount: integer('amount').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    transactionId: varchar('transaction_id', { length: 255 }).unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    contestIdIdx: index('prize_transactions_contest_id_idx').on(
      table.contestId
    ),
    userIdIdx: index('prize_transactions_user_id_idx').on(table.userId),
    statusIdx: index('prize_transactions_status_idx').on(table.status),
  })
);

export type PrizeTransaction = typeof prizeTransactions.$inferSelect;
export type NewPrizeTransaction = typeof prizeTransactions.$inferInsert;
