export type Follow = {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Date;
};

export type CreateFollowInput = {
  followerId: string;
  followingId: string;
};

export type FollowResponse = {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
};

export type FollowStats = {
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
};
