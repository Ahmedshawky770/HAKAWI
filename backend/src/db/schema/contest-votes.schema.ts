import { pgTable, uuid, timestamp, index, unique } from 'drizzle-orm/pg-core';
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
    userIdContestIdUnique: unique('contest_votes_user_id_contest_id_unique').on(table.userId, table.contestId),
    contestIdIdx: index('contest_votes_contest_id_idx').on(table.contestId),
    userIdIdx: index('contest_votes_user_id_idx').on(table.userId),
    submissionIdIdx: index('contest_votes_submission_id_idx').on(table.submissionId),
  })
);

export type ContestVote = typeof contestVotes.$inferSelect;
export type NewContestVote = typeof contestVotes.$inferInsert;
