import {
  pgTable,
  uuid,
  timestamp,
  index,
  integer,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const rentalExtensions = pgTable(
  'rental_extensions',
  {
    id: uuid('id').default(createId()).primaryKey(),
    rentalId: uuid('rental_id').notNull(),
    userId: uuid('user_id').notNull(),
    oldEndDate: timestamp('old_end_date').notNull(),
    newEndDate: timestamp('new_end_date').notNull(),
    extensionPrice: integer('extension_price').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    rentalIdIdx: index('rental_extensions_rental_id_idx').on(table.rentalId),
    userIdIdx: index('rental_extensions_user_id_idx').on(table.userId),
  })
);

export type RentalExtension = typeof rentalExtensions.$inferSelect;
export type NewRentalExtension = typeof rentalExtensions.$inferInsert;
