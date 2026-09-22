import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const storyTags = pgTable(
  'story_tags',
  {
    id: uuid('id').default(createId()).primaryKey(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index('story_tags_slug_idx').on(table.slug),
  })
);

export type StoryTag = typeof storyTags.$inferSelect;
export type NewStoryTag = typeof storyTags.$inferInsert;
