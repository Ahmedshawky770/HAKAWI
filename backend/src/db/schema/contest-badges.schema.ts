import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const contestBadges = pgTable(
  'contest_badges',
  {
    id: uuid('id').default(createId()).primaryKey(),
    contestId: uuid('contest_id').notNull(),
    winnerId: uuid('winner_id').notNull(),
    badgeType: varchar('badge_type', { length: 50 }).notNull(),
    prizeAmount: varchar('prize_amount', { length: 20 }).notNull(),
    awardedAt: timestamp('awarded_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    contestIdIdx: index('contest_badges_contest_id_idx').on(table.contestId),
    winnerIdIdx: index('contest_badges_winner_id_idx').on(table.winnerId),
  })
);

export type ContestBadge = typeof contestBadges.$inferSelect;
export type NewContestBadge = typeof contestBadges.$inferInsert;
