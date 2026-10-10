export const CONTESTS_REPOSITORY = Symbol('CONTESTS_REPOSITORY');

import type {
  Contest,
  ContestCategorySummary,
  ContestSubmission,
  ContestVote,
  ContestPrize,
  CreateContestInput,
  UpdateContestInput,
  CreateSubmissionInput,
  ReviewSubmissionInput,
  CastVoteInput,
  SelectWinnerInput,
  DistributePrizeInput,
} from '../types.ts';

export type {
  Contest,
  ContestCategorySummary,
  ContestSubmission,
  ContestVote,
  ContestPrize,
  CreateContestInput,
  UpdateContestInput,
  CreateSubmissionInput,
  ReviewSubmissionInput,
  CastVoteInput,
  SelectWinnerInput,
  DistributePrizeInput,
};

export interface IContestsRepository {
  findContestById(id: string): Promise<Contest | null>;
  findAllContests(params: {
    page?: number;
    limit?: number;
    categoryId?: string;
    status?: string;
    search?: string;
  }): Promise<{ contests: Contest[]; total: number }>;
  findCategoriesByIds(categoryIds: string[]): Promise<ContestCategorySummary[]>;
  createContest(data: CreateContestInput & { createdBy: string; status: string }): Promise<Contest>;
  updateContest(id: string, data: UpdateContestInput): Promise<Contest>;
  findSubmissionById(id: string): Promise<ContestSubmission | null>;
  findSubmissionsByContest(
    contestId: string,
    page: number,
    limit: number,
  ): Promise<{ submissions: ContestSubmission[]; total: number }>;
  findSubmissionByContestAndAuthor(contestId: string, authorId: string): Promise<ContestSubmission | null>;
  createSubmission(data: CreateSubmissionInput): Promise<ContestSubmission>;
  reviewSubmission(id: string, status: string, reviewedBy: string): Promise<ContestSubmission>;
  findVoteById(id: string): Promise<ContestVote | null>;
  findVoteByUserContestSubmission(contestId: string, submissionId: string, userId: string): Promise<ContestVote | null>;
  findVotesBySubmission(submissionId: string): Promise<ContestVote[]>;
  findVotesByContest(contestId: string, limit: number, offset: number): Promise<ContestVote[]>;
  countVotesBySubmission(submissionId: string): Promise<number>;
  countVotesByContest(contestId: string): Promise<{ total: string }>;
  castVote(data: CastVoteInput): Promise<ContestVote>;
  findPrizeById(id: string): Promise<ContestPrize | null>;
  createPrize(data: DistributePrizeInput): Promise<ContestPrize>;
  findWinningSubmission(contestId: string): Promise<ContestSubmission | null>;
  findPrizesByContest(contestId: string): Promise<ContestPrize[]>;
}
