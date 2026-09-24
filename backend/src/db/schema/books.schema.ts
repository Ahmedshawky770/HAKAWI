import { pgTable, uuid, varchar, text, timestamp, boolean, integer, index, primaryKey } from 'drizzle-orm/pg-core';

import { users } from './users.schema.ts';
import { tags } from './stories.schema.ts';

export const bookCategories = pgTable(
  'book_categories',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index('book_categories_slug_idx').on(table.slug),
  })
);

export const books = pgTable(
  'books',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    author: varchar('author', { length: 255 }).notNull(),
    description: text('description'),
    coverImage: text('cover_image'),
    isbn: varchar('isbn', { length: 20 }),
    publisher: varchar('publisher', { length: 255 }),
    publishDate: timestamp('publish_date'),
    language: varchar('language', { length: 50 }),
    pageCount: integer('page_count'),
    fileUrl: text('file_url'),
    fileType: varchar('file_type', { length: 50 }),
    price: integer('price'),
    isFree: boolean('is_free').default(true).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    categoryId: uuid('category_id').references(() => bookCategories.id),
    viewCount: integer('view_count').default(0).notNull(),
    likeCount: integer('like_count').default(0).notNull(),
    downloadCount: integer('download_count').default(0).notNull(),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    authorIdx: index('books_author_idx').on(table.author),
    statusIdx: index('books_status_idx').on(table.status),
    categoryIdx: index('books_category_id_idx').on(table.categoryId),
    titleIdx: index('books_title_idx').on(table.title),
    isbnIdx: index('books_isbn_idx').on(table.isbn),
  })
);

export const bookTags = pgTable(
  'book_tags',
  {
    bookId: uuid('book_id').notNull().references(() => books.id),
    tagId: uuid('tag_id').notNull().references(() => tags.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.bookId, table.tagId] }),
    bookIdx: index('book_tags_book_id_idx').on(table.bookId),
    tagIdx: index('book_tags_tag_id_idx').on(table.tagId),
  })
);

export const readingProgress = pgTable(
  'reading_progress',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    bookId: uuid('book_id').notNull().references(() => books.id),
    currentPage: integer('current_page').default(0).notNull(),
    totalPages: integer('total_pages'),
    progressPercentage: integer('progress_percentage').default(0).notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    lastReadAt: timestamp('last_read_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userBookIdx: index('reading_progress_user_book_idx').on(table.userId, table.bookId),
    userIdx: index('reading_progress_user_id_idx').on(table.userId),
    bookIdx: index('reading_progress_book_id_idx').on(table.bookId),
  })
);

export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;
export type BookCategory = typeof bookCategories.$inferSelect;
export type NewBookCategory = typeof bookCategories.$inferInsert;
export type BookTag = typeof bookTags.$inferSelect;
export type ReadingProgress = typeof readingProgress.$inferSelect;
export type NewReadingProgress = typeof readingProgress.$inferInsert;
