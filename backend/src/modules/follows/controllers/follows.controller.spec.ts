import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';

import { FollowsController } from './follows.controller.ts';
import { FollowsService } from '../follows.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { ConfigModule } from '@nestjs/config';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET } as any).signAsync({ sub, email, accountType } as any);
}

describe('FollowsController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let followsService: Partial<FollowsService>;

  beforeAll(async () => {
    followsService = {
      follow: vi.fn(),
      unfollow: vi.fn(),
      getFollowers: vi.fn(),
      getFollowing: vi.fn(),
      getStats: vi.fn(),
      isFollowing: vi.fn(),
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
          useValue: new JwtService({ secret: JWT_SECRET } as any),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
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
      } as any);

      const res = await request(httpServer)
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

      const res = await request(httpServer)
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
      } as any);

      const res = await request(httpServer)
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
      } as any);

      const res = await request(httpServer)
        .get('/follows/user/123e4567-e89b-12d3-a456-426614174000/following')
        .expect(200);

      expect(res.body).toHaveProperty('following');
      expect(res.body).toHaveProperty('total', 0);
      expect(followsService.getFollowing).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 1, 20);
    });
  });

  describe('GET /follows/user/:userId/stats', () => {
    it('should return follow stats for a user', async () => {
      vi.mocked(followsService.getStats).mockResolvedValue({
        followersCount: 10,
        followingCount: 3,
        isFollowing: false,
      } as any);

      const res = await request(httpServer)
        .get('/follows/user/123e4567-e89b-12d3-a456-426614174000/stats')
        .expect(200);

      expect(res.body).toEqual({
        followersCount: 10,
        followingCount: 3,
        isFollowing: false,
      });
      expect(followsService.getStats).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', undefined);
    });
  });

  describe('GET /follows/check/:followingId', () => {
    it('should check if current user is following another user', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(followsService.isFollowing).mockResolvedValue(true);

      const res = await request(httpServer)
        .get('/follows/check/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ isFollowing: true });
      expect(followsService.isFollowing).toHaveBeenCalledWith('user-1', '123e4567-e89b-12d3-a456-426614174000');
    });
  });
});
