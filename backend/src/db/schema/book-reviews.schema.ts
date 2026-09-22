import { pgTable, uuid, varchar, text, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const bookReviews = pgTable(
  'book_reviews',
  {
    id: uuid('id').default(createId()).primaryKey(),
    bookId: uuid('book_id').notNull(),
    userId: uuid('user_id').notNull(),
    rating: varchar('rating', { length: 10 }).notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdBookIdUnique: unique('book_reviews_user_id_book_id_unique').on(table.userId, table.bookId),
    bookIdIdx: index('book_reviews_book_id_idx').on(table.bookId),
    userIdIdx: index('book_reviews_user_id_idx').on(table.userId),
  })
);

export type BookReview = typeof bookReviews.$inferSelect;
export type NewBookReview = typeof bookReviews.$inferInsert;
