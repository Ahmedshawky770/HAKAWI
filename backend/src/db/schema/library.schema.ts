import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';

import { users } from './users.schema.ts';
import { books } from './books.schema.ts';
import { rentals } from './rentals.schema.ts';

export const library = pgTable(
  'library',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    bookId: uuid('book_id').notNull().references(() => books.id),
    rentalId: uuid('rental_id').references(() => rentals.id),
    status: varchar('status', { length: 20 }).notNull().default('owned'),
    addedAt: timestamp('added_at').defaultNow().notNull(),
    lastAccessedAt: timestamp('last_accessed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('library_user_id_idx').on(table.userId),
    bookIdx: index('library_book_id_idx').on(table.bookId),
    rentalIdx: index('library_rental_id_idx').on(table.rentalId),
    userBookIdx: index('library_user_book_idx').on(table.userId, table.bookId),
  })
);

export type LibraryItem = typeof library.$inferSelect;
export type NewLibraryItem = typeof library.$inferInsert;
