import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { categories } from './stories.schema.ts';
import { users } from './users.schema.ts';

export const contests = pgTable(
  'contests',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    categoryId: uuid('category_id').references(() => categories.id),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    submissionDeadline: timestamp('submission_deadline').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    winnerId: uuid('winner_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    categoryIdx: index('contests_category_id_idx').on(table.categoryId),
    statusIdx: index('contests_status_idx').on(table.status),
    createdByIdx: index('contests_created_by_idx').on(table.createdBy),
    startDateIdx: index('contests_start_date_idx').on(table.startDate),
    endDateIdx: index('contests_end_date_idx').on(table.endDate),
  })
);

export const contestSubmissions = pgTable(
  'contest_submissions',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    contestId: uuid('contest_id').notNull().references(() => contests.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').notNull().references(() => users.id),
    authorId: uuid('author_id').notNull().references(() => users.id),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
  },
  (table) => ({
    contestIdIdx: index('contest_submissions_contest_id_idx').on(table.contestId),
    authorIdIdx: index('contest_submissions_author_id_idx').on(table.authorId),
    statusIdx: index('contest_submissions_status_idx').on(table.status),
  })
);

export const contestVotes = pgTable(
  'contest_votes',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    contestId: uuid('contest_id').notNull().references(() => contests.id, { onDelete: 'cascade' }),
    submissionId: uuid('submission_id').notNull().references(() => contestSubmissions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueVote: uniqueIndex('contest_votes_unique_idx').on(table.contestId, table.submissionId, table.userId),
    contestIdIdx: index('contest_votes_contest_id_idx').on(table.contestId),
    userIdIdx: index('contest_votes_user_id_idx').on(table.userId),
  })
);

export const contestPrizes = pgTable(
  'contest_prizes',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    contestId: uuid('contest_id').notNull().references(() => contests.id, { onDelete: 'cascade' }),
    submissionId: uuid('submission_id').notNull().references(() => contestSubmissions.id, { onDelete: 'cascade' }),
    winnerId: uuid('winner_id').notNull().references(() => users.id),
    prizeType: varchar('prize_type', { length: 50 }).notNull(),
    prizeDescription: text('prize_description'),
    distributedAt: timestamp('distributed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    contestIdIdx: index('contest_prizes_contest_id_idx').on(table.contestId),
    winnerIdIdx: index('contest_prizes_winner_id_idx').on(table.winnerId),
  })
);

export type Contest = typeof contests.$inferSelect;
export type NewContest = typeof contests.$inferInsert;
export type ContestSubmission = typeof contestSubmissions.$inferSelect;
export type NewContestSubmission = typeof contestSubmissions.$inferInsert;
export type ContestVote = typeof contestVotes.$inferSelect;
export type NewContestVote = typeof contestVotes.$inferInsert;
export type ContestPrize = typeof contestPrizes.$inferSelect;
export type NewContestPrize = typeof contestPrizes.$inferInsert;
