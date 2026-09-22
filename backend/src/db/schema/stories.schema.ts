import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const stories = pgTable(
  'stories',
  {
    id: uuid('id').default(createId()).primaryKey(),
    authorId: uuid('author_id').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),
    excerpt: text('excerpt'),
    coverImage: text('cover_image'),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    isPublished: boolean('is_published').default(false),
    publishedAt: timestamp('published_at'),
    approvedAt: timestamp('approved_at'),
    rejectedAt: timestamp('rejected_at'),
    rejectionReason: text('rejection_reason'),
    viewsCount: varchar('views_count', { length: 20 }).default('0'),
    likesCount: varchar('likes_count', { length: 20 }).default('0'),
    commentsCount: varchar('comments_count', { length: 20 }).default('0'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    authorIdIdx: index('stories_author_id_idx').on(table.authorId),
    statusIdx: index('stories_status_idx').on(table.status),
    publishedAtIdx: index('stories_published_at_idx').on(table.publishedAt),
  })
);

export type Story = typeof stories.$inferSelect;
export type NewStory = typeof stories.$inferInsert;
