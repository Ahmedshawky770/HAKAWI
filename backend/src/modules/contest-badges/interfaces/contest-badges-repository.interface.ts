export interface IContestBadgesRepository {
  findById(id: string): Promise<ContestBadge | null>;
  findByContestId(contestId: string): Promise<ContestBadge[]>;
  findByWinnerId(winnerId: string): Promise<ContestBadge[]>;
  create(data: CreateContestBadgeData): Promise<ContestBadge>;
}

export interface ContestBadge {
  id: string;
  contestId: string;
  winnerId: string;
  badgeType: string;
  awardedAt: Date;
}

export interface CreateContestBadgeData {
  contestId: string;
  winnerId: string;
  badgeType: string;
}

export const CONTEST_BADGES_REPOSITORY = 'CONTEST_BADGES_REPOSITORY';
