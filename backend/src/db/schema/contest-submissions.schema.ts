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

export const contestSubmissions = pgTable(
  'contest_submissions',
  {
    id: uuid('id').default(createId()).primaryKey(),
    contestId: uuid('contest_id').notNull(),
    authorId: uuid('author_id').notNull(),
    storyId: uuid('story_id').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
    reviewNotes: text('review_notes'),
    finalRank: integer('final_rank'),
    votesCount: integer('votes_count').notNull().default(0),
  },
  (table) => ({
    contestIdIdx: index('contest_submissions_contest_id_idx').on(
      table.contestId
    ),
    authorIdIdx: index('contest_submissions_author_id_idx').on(table.authorId),
    storyIdIdx: index('contest_submissions_story_id_idx').on(table.storyId),
    statusIdx: index('contest_submissions_status_idx').on(table.status),
    contestAuthorUnique: unique('contest_submissions_contest_id_author_id_key')
      .on(table.contestId, table.authorId),
  })
);

export type ContestSubmission = typeof contestSubmissions.$inferSelect;
export type NewContestSubmission = typeof contestSubmissions.$inferInsert;
