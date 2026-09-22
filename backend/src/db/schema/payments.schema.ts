import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  unique,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').default(createId()).primaryKey(),
    userId: uuid('user_id').notNull(),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('EGP'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    transactionId: varchar('transaction_id', { length: 255 }).unique(),
    paymentMethodId: varchar('payment_method_id', { length: 255 }),
    metadata: jsonb('metadata'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('payments_user_id_idx').on(table.userId),
    statusIdx: index('payments_status_idx').on(table.status),
    transactionIdIdx: index('payments_transaction_id_idx').on(table.transactionId),
    createdAtIdx: index('payments_created_at_idx').on(table.createdAt),
  })
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
