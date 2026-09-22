import { pgTable, uuid, varchar, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const userLibraries = pgTable(
  'user_libraries',
  {
    id: uuid('id').default(createId()).primaryKey(),
    userId: uuid('user_id').notNull(),
    bookId: uuid('book_id').notNull(),
    accessType: varchar('access_type', { length: 20 }).notNull(),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdBookIdUnique: unique('user_libraries_user_id_book_id_unique').on(table.userId, table.bookId),
    userIdIdx: index('user_libraries_user_id_idx').on(table.userId),
    bookIdIdx: index('user_libraries_book_id_idx').on(table.bookId),
  })
);

export type UserLibrary = typeof userLibraries.$inferSelect;
export type NewUserLibrary = typeof userLibraries.$inferInsert;
