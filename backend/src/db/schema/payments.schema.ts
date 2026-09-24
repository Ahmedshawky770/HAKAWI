import { pgTable, uuid, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';

import { users } from './users.schema.ts';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('EGP'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
    paymobOrderId: varchar('paymob_order_id', { length: 255 }),
    paymobPaymentId: varchar('paymob_payment_id', { length: 255 }),
    paymobTransactionId: varchar('paymob_transaction_id', { length: 255 }),
    metadata: text('metadata'),
    description: text('description'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('payments_user_id_idx').on(table.userId),
    statusIdx: index('payments_status_idx').on(table.status),
    orderIdx: index('payments_order_id_idx').on(table.paymobOrderId),
  })
);

export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    paymentId: uuid('payment_id').notNull().references(() => payments.id),
    type: varchar('type', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    gatewayResponse: text('gateway_response'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    paymentIdx: index('payment_transactions_payment_id_idx').on(table.paymentId),
  })
);

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    paymentId: uuid('payment_id').notNull().references(() => payments.id),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    reason: text('reason'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    paymobRefundId: varchar('paymob_refund_id', { length: 255 }),
    metadata: text('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    paymentIdx: index('refunds_payment_id_idx').on(table.paymentId),
  })
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type NewPaymentTransaction = typeof paymentTransactions.$inferInsert;
export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
