import { symbol } from '../../common/utils/symbol.util.js';
import type { ContestVote } from '../../../db/schema/contest-votes.schema.js';
import type { NewContestVote } from '../../../db/schema/contest-votes.schema.js';

export const CONTEST_VOTES_REPOSITORY = symbol('CONTEST_VOTES_REPOSITORY');

export type CreateContestVoteData = NewContestVote;

export { ContestVote };

export interface IContestVotesRepository {
  findById(id: string): Promise<ContestVote | null>;
  findByContestAndUser(contestId: string, userId: string): Promise<ContestVote | null>;
  findBySubmissionId(submissionId: string): Promise<ContestVote[]>;
  countBySubmission(submissionId: string): Promise<number>;
  create(data: CreateContestVoteData): Promise<ContestVote>;
}
