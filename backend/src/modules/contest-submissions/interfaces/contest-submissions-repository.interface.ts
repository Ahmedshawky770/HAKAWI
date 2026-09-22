export interface IContestSubmissionsRepository {
  findById(id: string): Promise<ContestSubmission | null>;
  findByContestId(contestId: string): Promise<ContestSubmission[]>;
  findByAuthorId(authorId: string): Promise<ContestSubmission[]>;
  findByContestAndAuthor(contestId: string, authorId: string): Promise<ContestSubmission | null>;
  create(data: CreateContestSubmissionData): Promise<ContestSubmission>;
  update(id: string, data: Partial<UpdateContestSubmissionData>): Promise<ContestSubmission>;
  countByContest(contestId: string): Promise<number>;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'winner' | 'runner_up';

export interface ContestSubmission {
  id: string;
  contestId: string;
  authorId: string;
  storyId: string;
  status: SubmissionStatus;
  submittedAt: Date;
  reviewNotes: string | null;
  finalRank: number | null;
  votesCount: number;
}

export interface CreateContestSubmissionData {
  contestId: string;
  authorId: string;
  storyId: string;
  status: SubmissionStatus;
  reviewNotes?: string | null;
  finalRank?: number | null;
  votesCount?: number;
}

export interface UpdateContestSubmissionData extends Partial<Pick<ContestSubmission, 'status' | 'reviewNotes' | 'finalRank' | 'votesCount'>> {}

export const CONTEST_SUBMISSIONS_REPOSITORY = 'CONTEST_SUBMISSIONS_REPOSITORY';
