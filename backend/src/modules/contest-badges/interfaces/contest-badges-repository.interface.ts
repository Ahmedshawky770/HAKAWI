import { symbol } from '../../common/utils/symbol.util.js';
import type { ContestBadge } from '../../../db/schema/contest-badges.schema.js';
import type { NewContestBadge } from '../../../db/schema/contest-badges.schema.js';

export const CONTEST_BADGES_REPOSITORY = symbol('CONTEST_BADGES_REPOSITORY');

export type CreateContestBadgeData = NewContestBadge;

export { ContestBadge };

export interface IContestBadgesRepository {
  findById(id: string): Promise<ContestBadge | null>;
  findByContestId(contestId: string): Promise<ContestBadge[]>;
  findByWinnerId(winnerId: string): Promise<ContestBadge[]>;
  create(data: CreateContestBadgeData): Promise<ContestBadge>;
}
