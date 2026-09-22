import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').default(createId()).primaryKey(),
    paymentId: uuid('payment_id').notNull().unique(),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    refundedBy: uuid('refunded_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    paymentIdIdx: index('refunds_payment_id_idx').on(table.paymentId),
    refundedByIdx: index('refunds_refunded_by_idx').on(table.refundedBy),
  })
);

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
