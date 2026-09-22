import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').default(createId()).primaryKey(),
    paymentId: uuid('payment_id').notNull(),
    userId: uuid('user_id').notNull(),
    amount: varchar('amount', { length: 20 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    reason: text('reason'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    paymentIdIdx: index('refunds_payment_id_idx').on(table.paymentId),
    userIdIdx: index('refunds_user_id_idx').on(table.userId),
    statusIdx: index('refunds_status_idx').on(table.status),
    createdAtIdx: index('refunds_created_at_idx').on(table.createdAt),
  })
);

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
