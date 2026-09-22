import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  integer,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const bookRentals = pgTable(
  'book_rentals',
  {
    id: uuid('id').default(createId()).primaryKey(),
    bookId: uuid('book_id').notNull(),
    renterId: uuid('renter_id').notNull(),
    rentalDuration: varchar('rental_duration', { length: 20 }).notNull(),
    rentalPrice: integer('rental_price').notNull(),
    platformCommission: integer('platform_commission').notNull().default(0),
    ownerEarnings: integer('owner_earnings').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    extensionCount: integer('extension_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    bookIdIdx: index('book_rentals_book_id_idx').on(table.bookId),
    renterIdIdx: index('book_rentals_renter_id_idx').on(table.renterId),
    statusIdx: index('book_rentals_status_idx').on(table.status),
    endDateIdx: index('book_rentals_end_date_idx').on(table.endDate),
  })
);

export type BookRental = typeof bookRentals.$inferSelect;
export type NewBookRental = typeof bookRentals.$inferInsert;
