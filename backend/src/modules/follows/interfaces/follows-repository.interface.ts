export const FOLLOWS_REPOSITORY = Symbol('FOLLOWS_REPOSITORY');

export type Follow = {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Date;
};

/**
 * A follow edge plus the person it points at.
 *
 * Mirrors `FollowWithUser` in @hakawi/shared-types, with `createdAt` as a `Date`
 * because that is what Drizzle returns before the controller serialises it. The
 * interface declares the enriched shape so the JOIN cannot be forgotten by a
 * later implementation: the type is what forces the row to carry a `user`.
 */
export type FollowWithUser = Follow & { user: { id: string; name: string } };

export interface IFollowsRepository {
  findById(id: string): Promise<Follow | null>;
  findByUsers(followerId: string, followingId: string): Promise<Follow | null>;
  findFollowers(userId: string, page: number, limit: number): Promise<{ follows: FollowWithUser[]; total: number }>;
  findFollowing(userId: string, page: number, limit: number): Promise<{ follows: FollowWithUser[]; total: number }>;
  create(data: { followerId: string; followingId: string }): Promise<Follow>;
  delete(id: string): Promise<void>;
  countFollowers(userId: string): Promise<number>;
  countFollowing(userId: string): Promise<number>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
}
