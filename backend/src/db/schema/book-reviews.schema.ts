import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  unique,
  integer,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const bookReviews = pgTable(
  'book_reviews',
  {
    id: uuid('id').default(createId()).primaryKey(),
    bookId: uuid('book_id').notNull(),
    userId: uuid('user_id').notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    bookIdIdx: index('book_reviews_book_id_idx').on(table.bookId),
    userIdIdx: index('book_reviews_user_id_idx').on(table.userId),
    ratingIdx: index('book_reviews_rating_idx').on(table.rating),
    userBookUnique: unique('book_reviews_user_book_unique').on(table.userId, table.bookId),
  })
);

export type BookReview = typeof bookReviews.$inferSelect;
export type NewBookReview = typeof bookReviews.$inferInsert;
