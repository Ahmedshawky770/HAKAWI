import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const rentalExtensions = pgTable(
  'rental_extensions',
  {
    id: uuid('id').default(createId()).primaryKey(),
    rentalId: uuid('rental_id').notNull(),
    userId: uuid('user_id').notNull(),
    extensionDays: varchar('extension_days', { length: 10 }).notNull(),
    extensionPrice: varchar('extension_price', { length: 20 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    rentalIdIdx: index('rental_extensions_rental_id_idx').on(table.rentalId),
    userIdIdx: index('rental_extensions_user_id_idx').on(table.userId),
    createdAtIdx: index('rental_extensions_created_at_idx').on(table.createdAt),
  })
);

export type RentalExtension = typeof rentalExtensions.$inferSelect;
export type NewRentalExtension = typeof rentalExtensions.$inferInsert;
