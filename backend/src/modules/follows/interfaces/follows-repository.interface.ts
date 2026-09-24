export const FOLLOWS_REPOSITORY = Symbol('FOLLOWS_REPOSITORY');

export type Follow = {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Date;
};

export interface IFollowsRepository {
  findById(id: string): Promise<Follow | null>;
  findByUsers(followerId: string, followingId: string): Promise<Follow | null>;
  findFollowers(userId: string, page: number, limit: number): Promise<{ follows: Follow[]; total: number }>;
  findFollowing(userId: string, page: number, limit: number): Promise<{ follows: Follow[]; total: number }>;
  create(data: { followerId: string; followingId: string }): Promise<Follow>;
  delete(id: string): Promise<void>;
  countFollowers(userId: string): Promise<number>;
  countFollowing(userId: string): Promise<number>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
}
