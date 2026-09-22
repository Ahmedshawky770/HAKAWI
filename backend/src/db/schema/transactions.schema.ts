import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').default(createId()).primaryKey(),
    paymentId: uuid('payment_id'),
    userId: uuid('user_id').notNull(),
    amount: varchar('amount', { length: 20 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    type: varchar('type', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    paymentIdIdx: index('transactions_payment_id_idx').on(table.paymentId),
    userIdIdx: index('transactions_user_id_idx').on(table.userId),
    statusIdx: index('transactions_status_idx').on(table.status),
    createdAtIdx: index('transactions_created_at_idx').on(table.createdAt),
  })
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
