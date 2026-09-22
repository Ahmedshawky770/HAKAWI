import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const storyCategories = pgTable(
  'story_categories',
  {
    id: uuid('id').default(createId()).primaryKey(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: unique('story_categories_name_idx').on(table.name),
    slugIdx: unique('story_categories_slug_idx').on(table.slug),
  })
);

export type StoryCategory = typeof storyCategories.$inferSelect;
export type NewStoryCategory = typeof storyCategories.$inferInsert;
