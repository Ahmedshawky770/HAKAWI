import { isOneOf } from './common.js';
import type { NamedPage, NamedPaginated } from './common.js';

export const CONTEST_STATUSES = ['draft', 'active', 'voting', 'completed', 'cancelled'] as const;
export type ContestStatus = (typeof CONTEST_STATUSES)[number];

export const isContestStatus = (value: string): value is ContestStatus => isOneOf(CONTEST_STATUSES, value);

export const CONTEST_SUBMISSION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ContestSubmissionStatus = (typeof CONTEST_SUBMISSION_STATUSES)[number];

export const isContestSubmissionStatus = (value: string): value is ContestSubmissionStatus =>
  isOneOf(CONTEST_SUBMISSION_STATUSES, value);

export type Contest = {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  startDate: string;
  endDate: string;
  submissionDeadline: string;
  status: string;
  createdBy: string;
  winnerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContestsListResponse = NamedPaginated<'contests', Contest>;

export type ContestWriteResult = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

export type ContestSubmission = {
  id: string;
  contestId: string;
  storyId: string;
  authorId: string;
  status: ContestSubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type ContestSubmissionsResponse = NamedPage<'submissions', ContestSubmission>;

export type ContestVote = {
  id: string;
  contestId: string;
  submissionId: string;
  userId: string;
  createdAt: string;
};

export type ContestVotesResponse = NamedPage<'votes', ContestVote>;

export type ContestPrize = {
  id: string;
  contestId: string;
  submissionId: string;
  winnerId: string;
  prizeType: string;
  prizeDescription: string | null;
  distributedAt: string | null;
  createdAt: string;
};
