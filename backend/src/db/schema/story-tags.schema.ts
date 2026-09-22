import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const storyTags = pgTable(
  'story_tags',
  {
    id: uuid('id').default(createId()).primaryKey(),
    name: varchar('name', { length: 50 }).notNull().unique(),
    slug: varchar('slug', { length: 50 }).notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: unique('story_tags_name_idx').on(table.name),
    slugIdx: unique('story_tags_slug_idx').on(table.slug),
  })
);

export type StoryTag = typeof storyTags.$inferSelect;
export type NewStoryTag = typeof storyTags.$inferInsert;
