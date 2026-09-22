import { symbol } from '../../common/utils/symbol.util.js';
import type { UserRestriction } from '../../../db/schema/user-restrictions.schema.js';
import type { NewUserRestriction } from '../../../db/schema/user-restrictions.schema.js';

export const USER_RESTRICTIONS_REPOSITORY = symbol('USER_RESTRICTIONS_REPOSITORY');

export type RestrictionType = 'temporary' | 'permanent' | 'warning';

export type CreateUserRestrictionData = NewUserRestriction;

export { UserRestriction };

export interface IUserRestrictionsRepository {
  findById(id: string): Promise<UserRestriction | null>;
  findByUserId(userId: string): Promise<UserRestriction[]>;
  findActiveByUserId(userId: string): Promise<UserRestriction | null>;
  create(data: CreateUserRestrictionData): Promise<UserRestriction>;
  delete(id: string): Promise<void>;
  deleteExpired(): Promise<number>;
}
