import { symbol } from '../../common/utils/symbol.util.js';
import type { Contest } from '../../../db/schema/contests.schema.js';
import type { NewContest } from '../../../db/schema/contests.schema.js';

export const CONTESTS_REPOSITORY = symbol('CONTESTS_REPOSITORY');

export type ContestStatus = 'draft' | 'published' | 'closed' | 'cancelled';
export type PrizeType = 'monetary' | 'badge' | 'exposure' | 'other';
export type ParticipantType = 'open' | 'invited' | 'restricted';

export interface ContestFilters {
  category?: string;
  participantType?: string;
  page?: number;
  limit?: number;
}

export type CreateContestData = NewContest;
export type UpdateContestData = Partial<CreateContestData>;

export { Contest };

export interface IContestsRepository {
  findById(id: string): Promise<Contest | null>;
  findByPublisherId(publisherId: string): Promise<Contest[]>;
  findPublished(filters: ContestFilters): Promise<Contest[]>;
  create(data: CreateContestData): Promise<Contest>;
  update(id: string, data: Partial<UpdateContestData>): Promise<Contest>;
  delete(id: string): Promise<void>;
  count(filters: ContestFilters): Promise<number>;
}
