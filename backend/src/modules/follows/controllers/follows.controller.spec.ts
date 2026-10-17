import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { AccountRestrictionService } from '../../../common/services/account-restriction.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { FollowsService } from '../follows.service.ts';
import type { Follow, FollowStats } from '../types.ts';

import { FollowsController } from './follows.controller.ts';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type FollowListResponse = {
  follows: Follow[];
  total: number;
  page: number;
  limit: number;
};

type MockFollowsService = {
  follow: ReturnType<typeof vi.fn<(followerId: string, followingId: string) => Promise<Follow>>>;
  unfollow: ReturnType<typeof vi.fn<(followerId: string, followingId: string) => Promise<void>>>;
  getFollowers: ReturnType<typeof vi.fn<(userId: string, page: number, limit: number) => Promise<FollowListResponse>>>;
  getFollowing: ReturnType<typeof vi.fn<(userId: string, page: number, limit: number) => Promise<FollowListResponse>>>;
  getStats: ReturnType<typeof vi.fn<(userId: string, currentUserId: string) => Promise<FollowStats>>>;
  isFollowing: ReturnType<typeof vi.fn<(followerId: string, followingId: string) => Promise<boolean>>>;
};

describe('FollowsController', () => {
  let app: INestApplication<Server>;
  let followsService: MockFollowsService;

  beforeAll(async () => {
    followsService = {
      follow: vi.fn<(followerId: string, followingId: string) => Promise<Follow>>(),
      unfollow: vi.fn<(followerId: string, followingId: string) => Promise<void>>(),
      getFollowers: vi.fn<(userId: string, page: number, limit: number) => Promise<FollowListResponse>>(),
      getFollowing: vi.fn<(userId: string, page: number, limit: number) => Promise<FollowListResponse>>(),
      getStats: vi.fn<(userId: string, currentUserId: string) => Promise<FollowStats>>(),
      isFollowing: vi.fn<(followerId: string, followingId: string) => Promise<boolean>>(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [FollowsController],
      providers: [
        {
          provide: FollowsService,
          useValue: followsService,
        },
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET }),
        },
        // `@Secured` composes `RestrictionGuard`, which now reads the account's restriction through
        // the shared `AccountRestrictionService` (the same reader `AuthService` uses for a ban at
        // login). That service injects `ValkeyService` and the logger, and this module is hand-built
        // rather than importing `CommonModule`, so all three must be provided here or Nest fails at
        // DI resolution before any assertion runs. The reader answers "no restriction" by default.
        { provide: ValkeyService, useValue: { exists: vi.fn().mockResolvedValue(false), get: vi.fn(), set: vi.fn() } },
        {
          provide: WinstonLoggerService,
          useValue: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn(), verbose: vi.fn() },
        },
        {
          provide: AccountRestrictionService,
          useValue: {
            readCurrentRestriction: vi.fn().mockResolvedValue(null),
            hasActiveBan: vi.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /follows', () => {
    it('should follow a user', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(followsService.follow).mockResolvedValue({
        id: 'follow-1',
        followerId: 'user-1',
        followingId: 'user-2',
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/follows')
        .set('Authorization', `Bearer ${token}`)
        .send({ followingId: '123e4567-e89b-12d3-a456-426614174000' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'follow-1');
      expect(res.body).toHaveProperty('followerId', 'user-1');
      expect(res.body).toHaveProperty('followingId', 'user-2');
      expect(followsService.follow).toHaveBeenCalledWith('user-1', '123e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('DELETE /follows/:followingId', () => {
    it('should unfollow a user', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(followsService.unfollow).mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete('/follows/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Unfollowed successfully' });
      expect(followsService.unfollow).toHaveBeenCalledWith('user-1', '123e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('GET /follows/user/:userId/followers', () => {
    it('should return followers of a user', async () => {
      vi.mocked(followsService.getFollowers).mockResolvedValue({
        follows: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(app.getHttpServer())
        .get('/follows/user/123e4567-e89b-12d3-a456-426614174000/followers')
        .expect(200);

      expect(res.body).toHaveProperty('followers');
      expect(res.body).toHaveProperty('total', 0);
      expect(followsService.getFollowers).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 1, 20);
    });
  });

  describe('GET /follows/user/:userId/following', () => {
    it('should return users that a user is following', async () => {
      vi.mocked(followsService.getFollowing).mockResolvedValue({
        follows: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(app.getHttpServer())
        .get('/follows/user/123e4567-e89b-12d3-a456-426614174000/following')
        .expect(200);

      expect(res.body).toHaveProperty('following');
      expect(res.body).toHaveProperty('total', 0);
      expect(followsService.getFollowing).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 1, 20);
    });
  });

  describe('GET /follows/user/:userId/stats', () => {
    it('should return follow stats for a user, with a real viewer', async () => {
      // The route was `@Public()`, so `JwtAuthGuard` never ran, `request.user` was never assigned, and
      // `getStats` was always called with `undefined` — which is why `isFollowing` was permanently
      // false. The previous assertion pinned that broken call; this pins the fixed one.
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(followsService.getStats).mockResolvedValue({
        followersCount: 10,
        followingCount: 3,
        isFollowing: true,
      });

      const res = await request(app.getHttpServer())
        .get('/follows/user/123e4567-e89b-12d3-a456-426614174000/stats')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({
        followersCount: 10,
        followingCount: 3,
        isFollowing: true,
      });
      expect(followsService.getStats).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 'user-1');

      // Anonymous callers now get a 401 rather than a payload whose `isFollowing` is always false.
      // The public surface is `/follows/user/:id/followers` and `/following`, which stay `@Public()`.
      await request(app.getHttpServer()).get('/follows/user/123e4567-e89b-12d3-a456-426614174000/stats').expect(401);
    });
  });

  describe('GET /follows/check/:followingId', () => {
    it('should check if current user is following another user', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(followsService.isFollowing).mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .get('/follows/check/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ isFollowing: true });
      expect(followsService.isFollowing).toHaveBeenCalledWith('user-1', '123e4567-e89b-12d3-a456-426614174000');
    });
  });
});
