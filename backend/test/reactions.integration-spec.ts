import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';

import { AppModule } from '../src/app.module.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';
import { UsersEventHandler } from '../src/modules/users/events/users.event-handler.ts';
import { SanityService } from '../src/modules/stories/sanity/sanity.service.ts';

describe('Reactions Integration', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  let accessToken: string;
  let storyId: string;

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

    const registerRes = await request(httpServer)
      .post('/auth/register')
      .send({
        email: `reactions-int-${Date.now()}@example.com`,
        password: 'SecurePass123!',
        name: 'Reactions Integration User',
        username: `reactionsint${Date.now()}`,
      });

    accessToken = registerRes.body.tokens.accessToken;

    const storyRes = await request(httpServer)
      .post('/stories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Reactions Test Story',
        slug: `reactions-test-story-${Date.now()}`,
        content: '<p>Content</p>',
      });

    storyId = storyRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /reactions/stories/:storyId', () => {
    it('should add a reaction to a story', async () => {
      const res = await request(httpServer)
        .post(`/reactions/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'like' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.userId).toBeDefined();
      expect(res.body.storyId).toBe(storyId);
      expect(res.body.type).toBe('like');
    });

    it('should update existing reaction', async () => {
      await request(httpServer)
        .post(`/reactions/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'like' });

      const res = await request(httpServer)
        .post(`/reactions/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'love' })
        .expect(201);

      expect(res.body.type).toBe('love');
    });
  });

  describe('DELETE /reactions/stories/:storyId', () => {
    it('should remove a reaction from a story', async () => {
      await request(httpServer)
        .post(`/reactions/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'like' });

      const res = await request(httpServer)
        .delete(`/reactions/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('message');
    });
  });

  describe('GET /reactions/stories/:storyId', () => {
    it('should get reactions for a story', async () => {
      await request(httpServer)
        .post(`/reactions/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'like' });

      const res = await request(httpServer)
        .get(`/reactions/stories/${storyId}`)
        .expect(200);

      expect(res.body).toHaveProperty('reactions');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.reactions)).toBe(true);
    });
  });

  describe('GET /reactions/stories/:storyId/counts', () => {
    it('should get reaction counts for a story', async () => {
      await request(httpServer)
        .post(`/reactions/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'like' });

      const res = await request(httpServer)
        .get(`/reactions/stories/${storyId}/counts`)
        .expect(200);

      expect(res.body).toHaveProperty('like');
      expect(typeof res.body.like).toBe('number');
    });
  });

  describe('GET /reactions/stories/:storyId/me', () => {
    it('should get current user reaction for a story', async () => {
      await request(httpServer)
        .post(`/reactions/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'like' });

      const res = await request(httpServer)
        .get(`/reactions/stories/${storyId}/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('type');
      expect(res.body.type).toBe('like');
    });

    it('should return null when user has no reaction', async () => {
      const registerRes2 = await request(httpServer)
        .post('/auth/register')
        .send({
          email: 'reactions-int-2@example.com',
          password: 'SecurePass123!',
          name: 'Reactions Integration User 2',
          username: 'reactionsint2',
        });

      const accessToken2 = registerRes2.body.tokens.accessToken;

      const res = await request(httpServer)
        .get(`/reactions/stories/${storyId}/me`)
        .set('Authorization', `Bearer ${accessToken2}`)
        .expect(200);

      expect(res.body).toBeNull();
    });
  });
});
