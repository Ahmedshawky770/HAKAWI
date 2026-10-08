import request from 'supertest';

import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext, TestUser } from '../src/test/helpers/test-context.ts';
import type {
  FollowResponse,
  FollowersListResponse,
  FollowingListResponse,
  FollowStatsResponse,
  FollowStatusResponse,
} from '../src/test/helpers/test-response-types.ts';

interface FollowPair {
  follower: TestUser;
  followee: TestUser;
}

describe('Follows Integration', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  const createPair = async (): Promise<FollowPair> => {
    const follower = await context.registerAndLogin({ prefix: 'follower' });
    const followee = await context.registerAndLogin({ prefix: 'followee' });
    return { follower, followee };
  };

  const follow = (follower: TestUser, followingId: string) =>
    request(context.httpServer)
      .post('/follows')
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .send({ followingId });

  describe('POST /follows', () => {
    it('should follow a user', async () => {
      const { follower, followee } = await createPair();

      const res = await follow(follower, followee.id).expect(201);

      const body = res.body as FollowResponse;

      expect(body).toHaveProperty('id');
      expect(body.followerId).toBe(follower.id);
      expect(body.followingId).toBe(followee.id);
    });

    it('should return 409 when already following', async () => {
      const { follower, followee } = await createPair();
      await follow(follower, followee.id).expect(201);

      await follow(follower, followee.id).expect(409);
    });

    it('should return 400 when following yourself', async () => {
      const { follower } = await createPair();

      await follow(follower, follower.id).expect(400);
    });
  });

  describe('DELETE /follows/:followingId', () => {
    it('should unfollow a user', async () => {
      const { follower, followee } = await createPair();
      await follow(follower, followee.id).expect(201);

      const res = await request(context.httpServer)
        .delete(`/follows/${followee.id}`)
        .set('Authorization', `Bearer ${follower.accessToken}`)
        .expect(200);

      const body = res.body as { message: string };
      expect(body).toHaveProperty('message');
    });

    it('should return 404 when not following', async () => {
      const { follower, followee } = await createPair();

      await request(context.httpServer)
        .delete(`/follows/${followee.id}`)
        .set('Authorization', `Bearer ${follower.accessToken}`)
        .expect(404);
    });
  });

  describe('GET /follows/user/:userId/followers', () => {
    it('should return the followers list', async () => {
      const { follower, followee } = await createPair();
      await follow(follower, followee.id).expect(201);

      const res = await request(context.httpServer).get(`/follows/user/${followee.id}/followers`).expect(200);

      const body = res.body as FollowersListResponse;

      expect(body).toHaveProperty('followers');
      expect(Array.isArray(body.followers)).toBe(true);
      expect(body.total).toBe(1);
      expect(body.followers[0].followerId).toBe(follower.id);
    });
  });

  describe('GET /follows/user/:userId/following', () => {
    it('should return the following list', async () => {
      const { follower, followee } = await createPair();
      await follow(follower, followee.id).expect(201);

      const res = await request(context.httpServer).get(`/follows/user/${follower.id}/following`).expect(200);

      const body = res.body as FollowingListResponse;

      expect(body).toHaveProperty('following');
      expect(Array.isArray(body.following)).toBe(true);
      expect(body.total).toBe(1);
      expect(body.following[0].followingId).toBe(followee.id);
    });
  });

  describe('GET /follows/user/:userId/stats', () => {
    it('should return follow stats for the followee', async () => {
      const { follower, followee } = await createPair();
      await follow(follower, followee.id).expect(201);

      const res = await request(context.httpServer)
        .get(`/follows/user/${followee.id}/stats`)
        .set('Authorization', `Bearer ${follower.accessToken}`)
        .expect(200);

      const body = res.body as FollowStatsResponse;

      expect(body).toHaveProperty('followersCount');
      expect(body).toHaveProperty('followingCount');
      expect(body).toHaveProperty('isFollowing');
      expect(body.followersCount).toBe(1);
    });
  });

  describe('GET /follows/check/:followingId', () => {
    it('should report isFollowing true after following', async () => {
      const { follower, followee } = await createPair();
      await follow(follower, followee.id).expect(201);

      const res = await request(context.httpServer)
        .get(`/follows/check/${followee.id}`)
        .set('Authorization', `Bearer ${follower.accessToken}`)
        .expect(200);

      const body = res.body as FollowStatusResponse;

      expect(body.isFollowing).toBe(true);
    });

    it('should report isFollowing false when the user is not followed', async () => {
      const { follower, followee } = await createPair();

      const res = await request(context.httpServer)
        .get(`/follows/check/${follower.id}`)
        .set('Authorization', `Bearer ${followee.accessToken}`)
        .expect(200);

      const body = res.body as FollowStatusResponse;

      expect(body.isFollowing).toBe(false);
    });
  });
});
