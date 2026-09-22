export interface IUserRestrictionsRepository {
  findById(id: string): Promise<UserRestriction | null>;
  findByUserId(userId: string): Promise<UserRestriction[]>;
  findActiveByUserId(userId: string): Promise<UserRestriction | null>;
  create(data: CreateUserRestrictionData): Promise<UserRestriction>;
  delete(id: string): Promise<void>;
  deleteExpired(): Promise<number>;
}

export type RestrictionType = 'temporary_ban' | 'permanent_ban' | 'content_restriction' | 'rate_limit';

export interface UserRestriction {
  id: string;
  userId: string;
  restrictionType: RestrictionType;
  reason: string;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

export interface CreateUserRestrictionData {
  userId: string;
  restrictionType: RestrictionType;
  reason: string;
  expiresAt?: Date | null;
  createdBy: string;
}

export const USER_RESTRICTIONS_REPOSITORY = 'USER_RESTRICTIONS_REPOSITORY';
