import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';

import { AppModule } from '../src/app.module.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';
import { UsersEventHandler } from '../src/modules/users/events/users.event-handler.ts';
import { SanityService } from '../src/modules/stories/sanity/sanity.service.ts';

describe('Stories Integration', () => {
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
        email: 'stories-int@example.com',
        password: 'SecurePass123!',
        name: 'Stories Integration User',
        username: 'storiesint',
      });

    accessToken = registerRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /stories', () => {
    it('should create a new story', async () => {
      const res = await request(httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Test Story',
          slug: 'test-story',
          content: '<p>Story content</p>',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('Test Story');
      expect(res.body.status).toBe('draft');

      storyId = res.body.id;
    });
  });

  describe('GET /stories', () => {
    it('should get list of stories', async () => {
      const res = await request(httpServer)
        .get('/stories')
        .expect(200);

      expect(res.body).toHaveProperty('stories');
      expect(Array.isArray(res.body.stories)).toBe(true);
    });
  });

  describe('GET /stories/:id', () => {
    it('should get a story by id', async () => {
      const res = await request(httpServer)
        .get(`/stories/${storyId}`)
        .expect(200);

      expect(res.body.id).toBe(storyId);
      expect(res.body.title).toBe('Test Story');
    });

    it('should return 404 when story not found', async () => {
      await request(httpServer)
        .get('/stories/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('PATCH /stories/:id', () => {
    it('should update a story', async () => {
      const res = await request(httpServer)
        .patch(`/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      expect(res.body.title).toBe('Updated Title');
    });
  });

  describe('DELETE /stories/:id', () => {
    it('should soft delete a story', async () => {
      const res = await request(httpServer)
        .delete(`/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });
  });
});
