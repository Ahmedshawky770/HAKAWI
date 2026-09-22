import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const storyCategories = pgTable(
  'story_categories',
  {
    id: uuid('id').default(createId()).primaryKey(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index('story_categories_slug_idx').on(table.slug),
  })
);

export type StoryCategory = typeof storyCategories.$inferSelect;
export type NewStoryCategory = typeof storyCategories.$inferInsert;
