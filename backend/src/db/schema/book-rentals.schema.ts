import { pgTable, uuid, varchar, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const bookRentals = pgTable(
  'book_rentals',
  {
    id: uuid('id').default(createId()).primaryKey(),
    bookId: uuid('book_id').notNull(),
    renterId: uuid('renter_id').notNull(),
    rentalDuration: varchar('rental_duration', { length: 20 }).notNull(),
    rentalPrice: varchar('rental_price', { length: 20 }).notNull(),
    platformCommission: varchar('platform_commission', { length: 20 }).notNull(),
    ownerEarnings: varchar('owner_earnings', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    extensionCount: varchar('extension_count', { length: 10 }).default('0'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    bookIdIdx: index('book_rentals_book_id_idx').on(table.bookId),
    renterIdIdx: index('book_rentals_renter_id_idx').on(table.renterId),
    statusIdx: index('book_rentals_status_idx').on(table.status),
    startDateIdx: index('book_rentals_start_date_idx').on(table.startDate),
    endDateIdx: index('book_rentals_end_date_idx').on(table.endDate),
  })
);

export type BookRental = typeof bookRentals.$inferSelect;
export type NewBookRental = typeof bookRentals.$inferInsert;
