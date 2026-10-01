import { reviveRequiredDate } from '../shared/cache/date-revival.ts';

export type Contest = {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  startDate: Date;
  endDate: Date;
  submissionDeadline: Date;
  status: string;
  createdBy: string;
  winnerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ContestSubmission = {
  id: string;
  contestId: string;
  storyId: string;
  authorId: string;
  status: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
};

export type ContestVote = {
  id: string;
  contestId: string;
  submissionId: string;
  userId: string;
  createdAt: Date;
};

export type ContestPrize = {
  id: string;
  contestId: string;
  submissionId: string;
  winnerId: string;
  prizeType: string;
  prizeDescription: string | null;
  distributedAt: Date | null;
  createdAt: Date;
};

export type CreateContestInput = {
  title: string;
  description?: string | null;
  categoryId?: string | null;
  startDate: Date;
  endDate: Date;
  submissionDeadline: Date;
};

export type UpdateContestInput = Partial<{
  title: string;
  description: string | null;
  categoryId: string | null;
  startDate: Date;
  endDate: Date;
  submissionDeadline: Date;
  status: string;
  winnerId: string | null;
}>;

export type CreateSubmissionInput = {
  contestId: string;
  storyId: string;
  authorId: string;
};

export type ReviewSubmissionInput = {
  status: 'approved' | 'rejected';
};

export type CastVoteInput = {
  contestId: string;
  submissionId: string;
  userId: string;
};

export type SelectWinnerInput = {
  contestId: string;
  submissionId: string;
  winnerId: string;
};

export type DistributePrizeInput = {
  contestId: string;
  submissionId: string;
  winnerId: string;
  prizeType: string;
  prizeDescription?: string | null;
};

export type ContestStatus = 'draft' | 'active' | 'voting' | 'completed' | 'cancelled';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export type ContestResponse = {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  /**
   * The resolved category name, or `null` when the contest has no category or the category row is
   * gone. The client used to have to render the raw `categoryId` UUID, which is useless to a
   * reader; `stories` already resolves its category the same way (`relationsFor` in
   * `stories.service.ts`) and this field is what makes the two read alike.
   */
  category: string | null;
  startDate: string;
  endDate: string;
  submissionDeadline: string;
  status: string;
  createdBy: string;
  winnerId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Minimal projection needed to turn a `categoryId` into a displayable category name. */
export type ContestCategorySummary = {
  id: string;
  name: string;
};

export type ContestSubmissionResponse = {
  id: string;
  contestId: string;
  storyId: string;
  authorId: string;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type ContestVoteResponse = {
  id: string;
  contestId: string;
  submissionId: string;
  userId: string;
  createdAt: string;
};

export type ContestPrizeResponse = {
  id: string;
  contestId: string;
  submissionId: string;
  winnerId: string;
  prizeType: string;
  prizeDescription: string | null;
  distributedAt: string | null;
  createdAt: string;
};

export type ContestsListResponse = {
  contests: ContestResponse[];
  total: number;
  page: number;
  limit: number;
};

export type PublisherStatsResponse = {
  totalContests: number;
  activeContests: number;
  completedContests: number;
  totalSubmissions: number;
  pendingSubmissions: number;
  approvedSubmissions: number;
  rejectedSubmissions: number;
  totalVotes: number;
  totalPrizes: number;
};

export type PublisherSubmissionOverview = {
  id: string;
  storyId: string;
  authorId: string;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  votes: number;
  storyTitle?: string;
  authorName?: string;
};

export type PublisherVoteOverview = {
  id: string;
  submissionId: string;
  userId: string;
  createdAt: string;
  submissionTitle?: string;
  userName?: string;
};

/**
 * Restores the `Date` fields of a contest that came back from the cache.
 *
 * `toContestResponse` calls `.toISOString()` on `startDate`, `endDate`, `submissionDeadline`,
 * `createdAt` and `updatedAt`. `JSON.stringify` turns each of them into a string and `JSON.parse`
 * cannot tell it used to be a `Date`, so without this a cache *hit* hands the mapper strings and
 * the request dies with `TypeError: ...toISOString is not a function` — while the first, cold
 * request of every key succeeds, which is what makes this class of bug so hard to catch.
 *
 * Every one of these columns is `notNull` in `db/schema/contests.schema.ts`
 * (`startDate`, `endDate`, `submissionDeadline`, `createdAt`, `updatedAt`), so all of them are
 * revived as *required*: a null where the schema says the column is populated means the cached
 * payload is not the object that was cached, and guessing would turn a stale entry into wrong data.
 * A value that cannot be revived raises `CacheEntryCorruptError`, which `TaggedCacheService.get`
 * turns into a dropped key and a miss, so the entry heals instead of becoming a 500.
 *
 * The primitives are shared with every other cached entity
 * (`shared/cache/date-revival.ts`); the field list is contest knowledge and stays here
 * (Principle #10).
 */
export function reviveContestDates(contest: Contest): Contest {
  return {
    ...contest,
    startDate: reviveRequiredDate(contest.startDate, 'startDate'),
    endDate: reviveRequiredDate(contest.endDate, 'endDate'),
    submissionDeadline: reviveRequiredDate(contest.submissionDeadline, 'submissionDeadline'),
    createdAt: reviveRequiredDate(contest.createdAt, 'createdAt'),
    updatedAt: reviveRequiredDate(contest.updatedAt, 'updatedAt'),
  };
}
