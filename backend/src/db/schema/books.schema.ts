import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const books = pgTable(
  'books',
  {
    id: uuid('id').default(createId()).primaryKey(),
    ownerId: uuid('owner_id').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    subtitle: varchar('subtitle', { length: 255 }),
    authorName: varchar('author_name', { length: 255 }).notNull(),
    coverImage: text('cover_image'),
    pdfUrl: text('pdf_url'),
    pdfPages: integer('pdf_pages'),
    price: integer('price').notNull().default(0),
    isAvailable: boolean('is_available').notNull().default(true),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    ownerIdIdx: index('books_owner_id_idx').on(table.ownerId),
    isAvailableIdx: index('books_is_available_idx').on(table.isAvailable),
    createdAtIdx: index('books_created_at_idx').on(table.createdAt),
  })
);

export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;
