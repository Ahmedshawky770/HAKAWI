export const CONTESTS_REPOSITORY = Symbol('CONTESTS_REPOSITORY');

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

export interface IContestsRepository {
  findContestById(id: string): Promise<Contest | null>;
  findAllContests(params: {
    page?: number;
    limit?: number;
    categoryId?: string;
    status?: string;
    search?: string;
  }): Promise<{ contests: Contest[]; total: number }>;
  createContest(data: CreateContestInput & { createdBy: string; status: string }): Promise<Contest>;
  updateContest(id: string, data: UpdateContestInput): Promise<Contest>;
  findSubmissionById(id: string): Promise<ContestSubmission | null>;
  findSubmissionsByContest(contestId: string, page: number, limit: number): Promise<{ submissions: ContestSubmission[]; total: number }>;
  findSubmissionByContestAndAuthor(contestId: string, authorId: string): Promise<ContestSubmission | null>;
  createSubmission(data: CreateSubmissionInput): Promise<ContestSubmission>;
  reviewSubmission(id: string, status: string, reviewedBy: string): Promise<ContestSubmission>;
  findVoteById(id: string): Promise<ContestVote | null>;
  findVoteByUserContestSubmission(contestId: string, submissionId: string, userId: string): Promise<ContestVote | null>;
  countVotesBySubmission(submissionId: string): Promise<number>;
  castVote(data: CastVoteInput): Promise<ContestVote>;
  findPrizeById(id: string): Promise<ContestPrize | null>;
  createPrize(data: DistributePrizeInput): Promise<ContestPrize>;
  findWinningSubmission(contestId: string): Promise<ContestSubmission | null>;
  findPrizesByContest(contestId: string): Promise<ContestPrize[]>;
}
