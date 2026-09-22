import {
  pgTable,
  uuid,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const storyViews = pgTable(
  'story_views',
  {
    id: uuid('id').default(createId()).primaryKey(),
    storyId: uuid('story_id').notNull(),
    viewerId: uuid('viewer_id'),
    viewDuration: integer('view_duration'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    storyIdIdx: index('story_views_story_id_idx').on(table.storyId),
    viewerIdIdx: index('story_views_viewer_id_idx').on(table.viewerId),
    createdAtIdx: index('story_views_created_at_idx').on(table.createdAt),
  })
);

export type StoryView = typeof storyViews.$inferSelect;
export type NewStoryView = typeof storyViews.$inferInsert;
