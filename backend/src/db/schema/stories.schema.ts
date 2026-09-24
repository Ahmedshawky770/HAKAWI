import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

import { users } from './users.schema.ts';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description'),
    parentId: uuid('parent_id'),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    slugUnique: index('categories_slug_idx').on(table.slug),
    parentIdx: index('categories_parent_id_idx').on(table.parentId),
  })
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    name: varchar('name', { length: 50 }).notNull(),
    slug: varchar('slug', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index('tags_slug_idx').on(table.slug),
  })
);

export const stories = pgTable(
  'stories',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    authorId: uuid('author_id').notNull().references(() => users.id),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    excerpt: text('excerpt'),
    content: text('content'),
    coverImage: text('cover_image'),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    categoryId: uuid('category_id').references(() => categories.id),
    viewCount: integer('view_count').default(0).notNull(),
    likeCount: integer('like_count').default(0).notNull(),
    commentCount: integer('comment_count').default(0).notNull(),
    readingTime: integer('reading_time'),
    publishedAt: timestamp('published_at'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    authorIdx: index('stories_author_id_idx').on(table.authorId),
    statusIdx: index('stories_status_idx').on(table.status),
    categoryIdx: index('stories_category_id_idx').on(table.categoryId),
    slugIdx: index('stories_slug_idx').on(table.slug),
    publishedAtIdx: index('stories_published_at_idx').on(table.publishedAt),
  })
);

export const storyTags = pgTable(
  'story_tags',
  {
    storyId: uuid('story_id').notNull().references(() => stories.id),
    tagId: uuid('tag_id').notNull().references(() => tags.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.storyId, table.tagId] }),
    storyIdx: index('story_tags_story_id_idx').on(table.storyId),
    tagIdx: index('story_tags_tag_id_idx').on(table.tagId),
  })
);

export type Story = typeof stories.$inferSelect;
export type NewStory = typeof stories.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type StoryTag = typeof storyTags.$inferSelect;
