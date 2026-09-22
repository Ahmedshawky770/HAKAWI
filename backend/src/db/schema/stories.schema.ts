import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const stories = pgTable(
  'stories',
  {
    id: uuid('id').default(createId()).primaryKey(),
    sanityStoryId: varchar('sanity_story_id', { length: 255 }).unique(),
    authorId: uuid('author_id').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    description: text('description'),
    coverImage: text('cover_image'),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    wordCount: integer('word_count').notNull().default(0),
    readingTime: integer('reading_time').notNull().default(0),
    views: integer('views').notNull().default(0),
    reactions: integer('reactions').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    category: varchar('category', { length: 100 }),
    tags: text('tags').array(),
    publishedAt: timestamp('published_at'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    sanityStoryIdIdx: unique('stories_sanity_story_id_idx').on(table.sanityStoryId),
    authorIdIdx: index('stories_author_id_idx').on(table.authorId),
    statusIdx: index('stories_status_idx').on(table.status),
    categoryIdx: index('stories_category_idx').on(table.category),
    slugIdx: index('stories_slug_idx').on(table.slug),
    authorSlugIdx: unique('stories_author_slug_idx').on(table.authorId, table.slug),
  })
);

export type Story = typeof stories.$inferSelect;
export type NewStory = typeof stories.$inferInsert;
