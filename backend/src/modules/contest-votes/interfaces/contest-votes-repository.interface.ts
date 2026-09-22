export interface IContestVotesRepository {
  findById(id: string): Promise<ContestVote | null>;
  findByContestAndUser(contestId: string, userId: string): Promise<ContestVote | null>;
  findBySubmissionId(submissionId: string): Promise<ContestVote[]>;
  countBySubmission(submissionId: string): Promise<number>;
  create(data: CreateContestVoteData): Promise<ContestVote>;
}

export interface ContestVote {
  id: string;
  contestId: string;
  userId: string;
  submissionId: string;
  createdAt: Date;
}

export interface CreateContestVoteData {
  contestId: string;
  userId: string;
  submissionId: string;
}

export const CONTEST_VOTES_REPOSITORY = 'CONTEST_VOTES_REPOSITORY';
