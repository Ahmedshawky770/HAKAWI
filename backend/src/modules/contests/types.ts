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
  startDate: string;
  endDate: string;
  submissionDeadline: string;
  status: string;
  createdBy: string;
  winnerId: string | null;
  createdAt: string;
  updatedAt: string;
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
