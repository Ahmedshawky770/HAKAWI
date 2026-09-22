import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').default(createId()).primaryKey(),
    paymentId: uuid('payment_id').notNull(),
    userId: uuid('user_id').notNull(),
    type: varchar('type', { length: 20 }).notNull(),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('EGP'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    description: text('description'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    paymentIdIdx: index('transactions_payment_id_idx').on(table.paymentId),
    userIdIdx: index('transactions_user_id_idx').on(table.userId),
    typeIdx: index('transactions_type_idx').on(table.type),
    statusIdx: index('transactions_status_idx').on(table.status),
  })
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
