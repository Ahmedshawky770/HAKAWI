import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';

import { AppModule } from '../src/app.module.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';
import { UsersEventHandler } from '../src/modules/users/events/users.event-handler.ts';
import { SanityService } from '../src/modules/stories/sanity/sanity.service.ts';

describe('Follows Integration', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  let accessToken1: string;
  let accessToken2: string;
  let userId1: string;
  let userId2: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: 'REFLECTOR',
          useValue: new Reflector(),
        },
        {
          provide: WinstonLoggerService,
          useValue: {
            info: () => {},
            log: () => {},
            error: () => {},
            warn: () => {},
            debug: () => {},
            verbose: () => {},
          },
        },
        {
          provide: SanityService,
          useValue: {
            isEnabled: () => false,
            syncStoryToSanity: () => ({ success: true }),
            deleteStoryFromSanity: () => ({ success: true }),
            syncAllStories: () => [],
          },
        },
      ],
    })
    .overrideProvider(UsersEventHandler).useValue({
      handleUserRegistered: () => Promise.resolve(),
      handleUserUpdated: () => Promise.resolve(),
    })
    .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer();

    const registerRes1 = await request(httpServer)
      .post('/auth/register')
      .send({
        email: 'follows-int-1@example.com',
        password: 'SecurePass123!',
        name: 'Follows Integration User 1',
        username: 'followsint1',
      });

    accessToken1 = registerRes1.body.tokens.accessToken;
    userId1 = registerRes1.body.user.id;

    const registerRes2 = await request(httpServer)
      .post('/auth/register')
      .send({
        email: 'follows-int-2@example.com',
        password: 'SecurePass123!',
        name: 'Follows Integration User 2',
        username: 'followsint2',
      });

    accessToken2 = registerRes2.body.tokens.accessToken;
    userId2 = registerRes2.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /follows', () => {
    it('should follow a user', async () => {
      const res = await request(httpServer)
        .post('/follows')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({ followingId: userId2 })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.followerId).toBe(userId1);
      expect(res.body.followingId).toBe(userId2);
    });

    it('should throw ConflictException when already following', async () => {
      await request(httpServer)
        .post('/follows')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({ followingId: userId2 });

      await request(httpServer)
        .post('/follows')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({ followingId: userId2 })
        .expect(409);
    });

    it('should throw BadRequestException when following yourself', async () => {
      await request(httpServer)
        .post('/follows')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({ followingId: userId1 })
        .expect(400);
    });
  });

  describe('DELETE /follows/:followingId', () => {
    it('should unfollow a user', async () => {
      await request(httpServer)
        .post('/follows')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({ followingId: userId2 });

      const res = await request(httpServer)
        .delete(`/follows/${userId2}`)
        .set('Authorization', `Bearer ${accessToken1}`)
        .expect(200);

      expect(res.body).toHaveProperty('message');
    });

    it('should throw NotFoundException when not following', async () => {
      await request(httpServer)
        .delete(`/follows/${userId2}`)
        .set('Authorization', `Bearer ${accessToken1}`)
        .expect(404);
    });
  });

  describe('GET /follows/user/:userId/followers', () => {
    it('should get followers list', async () => {
      await request(httpServer)
        .post('/follows')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({ followingId: userId2 });

      const res = await request(httpServer)
        .get(`/follows/user/${userId2}/followers`)
        .expect(200);

      expect(res.body).toHaveProperty('followers');
      expect(Array.isArray(res.body.followers)).toBe(true);
    });
  });

  describe('GET /follows/user/:userId/following', () => {
    it('should get following list', async () => {
      await request(httpServer)
        .post('/follows')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({ followingId: userId2 });

      const res = await request(httpServer)
        .get(`/follows/user/${userId1}/following`)
        .expect(200);

      expect(res.body).toHaveProperty('following');
      expect(Array.isArray(res.body.following)).toBe(true);
    });
  });

  describe('GET /follows/user/:userId/stats', () => {
    it('should get follow stats', async () => {
      await request(httpServer)
        .post('/follows')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({ followingId: userId2 });

      const res = await request(httpServer)
        .get(`/follows/user/${userId2}/stats`)
        .expect(200);

      expect(res.body).toHaveProperty('followersCount');
      expect(res.body).toHaveProperty('followingCount');
      expect(res.body).toHaveProperty('isFollowing');
    });
  });

  describe('GET /follows/check/:followingId', () => {
    it('should check if following a user', async () => {
      await request(httpServer)
        .post('/follows')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({ followingId: userId2 });

      const res = await request(httpServer)
        .get(`/follows/check/${userId2}`)
        .set('Authorization', `Bearer ${accessToken1}`)
        .expect(200);

      expect(res.body).toHaveProperty('isFollowing');
      expect(res.body.isFollowing).toBe(true);
    });

    it('should return false when not following', async () => {
      const res = await request(httpServer)
        .get(`/follows/check/${userId1}`)
        .set('Authorization', `Bearer ${accessToken2}`)
        .expect(200);

      expect(res.body).toHaveProperty('isFollowing');
      expect(res.body.isFollowing).toBe(false);
    });
  });
});
