import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const contestVotes = pgTable(
  'contest_votes',
  {
    id: uuid('id').default(createId()).primaryKey(),
    contestId: uuid('contest_id').notNull(),
    userId: uuid('user_id').notNull(),
    submissionId: uuid('submission_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    contestIdIdx: index('contest_votes_contest_id_idx').on(table.contestId),
    submissionIdIdx: index('contest_votes_submission_id_idx').on(
      table.submissionId
    ),
    userIdIdx: index('contest_votes_user_id_idx').on(table.userId),
    userIdSubmissionIdUnique: unique('contest_votes_user_id_submission_id_key')
      .on(table.userId, table.submissionId),
  })
);

export type ContestVote = typeof contestVotes.$inferSelect;
export type NewContestVote = typeof contestVotes.$inferInsert;
