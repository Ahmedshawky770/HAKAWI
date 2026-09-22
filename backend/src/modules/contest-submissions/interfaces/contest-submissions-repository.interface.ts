import { symbol } from '../../common/utils/symbol.util.js';
import type { ContestSubmission } from '../../../db/schema/contest-submissions.schema.js';
import type { NewContestSubmission } from '../../../db/schema/contest-submissions.schema.js';

export const CONTEST_SUBMISSIONS_REPOSITORY = symbol('CONTEST_SUBMISSIONS_REPOSITORY');

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export type CreateContestSubmissionData = NewContestSubmission;
export type UpdateContestSubmissionData = Partial<CreateContestSubmissionData>;

export { ContestSubmission };

export interface IContestSubmissionsRepository {
  findById(id: string): Promise<ContestSubmission | null>;
  findByContestId(contestId: string): Promise<ContestSubmission[]>;
  findByAuthorId(authorId: string): Promise<ContestSubmission[]>;
  findByContestAndAuthor(contestId: string, authorId: string): Promise<ContestSubmission | null>;
  create(data: CreateContestSubmissionData): Promise<ContestSubmission>;
  update(id: string, data: Partial<UpdateContestSubmissionData>): Promise<ContestSubmission>;
  countByContest(contestId: string): Promise<number>;
}
