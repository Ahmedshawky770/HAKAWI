import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const contestSubmissions = pgTable(
  'contest_submissions',
  {
    id: uuid('id').default(createId()).primaryKey(),
    contestId: uuid('contest_id').notNull(),
    authorId: uuid('author_id').notNull(),
    storyId: uuid('story_id').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    contestIdIdx: index('contest_submissions_contest_id_idx').on(table.contestId),
    authorIdIdx: index('contest_submissions_author_id_idx').on(table.authorId),
    statusIdx: index('contest_submissions_status_idx').on(table.status),
  })
);

export type ContestSubmission = typeof contestSubmissions.$inferSelect;
export type NewContestSubmission = typeof contestSubmissions.$inferInsert;
