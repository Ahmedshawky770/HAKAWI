import { pgTable, uuid, varchar, timestamp, integer, index } from 'drizzle-orm/pg-core';

import { users } from './users.schema.ts';
import { books } from './books.schema.ts';

export const rentals = pgTable(
  'rentals',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    bookId: uuid('book_id').notNull().references(() => books.id),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    extendedCount: integer('extended_count').default(0).notNull(),
    maxExtensions: integer('max_extensions').default(2).notNull(),
    returnedAt: timestamp('returned_at'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('rentals_user_id_idx').on(table.userId),
    bookIdx: index('rentals_book_id_idx').on(table.bookId),
    statusIdx: index('rentals_status_idx').on(table.status),
  })
);

export const rentalExtensions = pgTable(
  'rental_extensions',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    rentalId: uuid('rental_id').notNull().references(() => rentals.id),
    previousEndDate: timestamp('previous_end_date').notNull(),
    newEndDate: timestamp('new_end_date').notNull(),
    extensionDays: integer('extension_days').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    rentalIdx: index('rental_extensions_rental_id_idx').on(table.rentalId),
  })
);

export type Rental = typeof rentals.$inferSelect;
export type NewRental = typeof rentals.$inferInsert;
export type RentalExtension = typeof rentalExtensions.$inferSelect;
export type NewRentalExtension = typeof rentalExtensions.$inferInsert;
