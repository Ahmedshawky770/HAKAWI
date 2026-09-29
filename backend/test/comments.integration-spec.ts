import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../src/app.module.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';
import { ValkeyService } from '../src/common/services/valkey.service.ts';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EncryptionService } from '../src/common/utils/encryption.util.ts';
import { UsersEventHandler } from '../src/modules/users/events/users.event-handler.ts';
import { SanityService } from '../src/modules/stories/sanity/sanity.service.ts';
import { db } from '../src/db/index.ts';
import { users } from '../src/db/schema/users.schema.ts';
import { stories } from '../src/db/schema/stories.schema.ts';

describe('Comments Integration', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  let accessToken: string;
  let storyId: string;
  let commentId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: 'REFLECTOR',
          useValue: new Reflector(),
        },
        WinstonLoggerService,
        ValkeyService,
        EventEmitter2,
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
    .overrideProvider(EncryptionService).useValue({
      encrypt: (plaintext: string) => plaintext,
      decrypt: (ciphertext: string) => ciphertext,
    })
    .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer();

    const registerRes = await request(httpServer)
      .post('/auth/register')
      .send({
        email: 'comments-int@example.com',
        password: 'SecurePass123!',
        name: 'Comments Integration User',
        username: 'commentsint',
      });

    accessToken = registerRes.body.tokens.accessToken;

    const storyRes = await request(httpServer)
      .post('/stories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Comments Test Story',
        slug: `comments-test-story-${Date.now()}`,
        content: '<p>Content</p>',
      });

    storyId = storyRes.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /comments', () => {
    it('should add a comment to a a story', async () => {
      const res = await request(httpServer)
        .post('/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ storyId, content: 'Great story!' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.authorId).toBeDefined();
      expect(res.body.storyId).toBe(storyId);
      expect(res.body.content).toBe('Great story!');

      commentId = res.body.id;
    });
  });

  describe('GET /comments/story/:storyId', () => {
    it('should get comments for a story', async () => {
      const res = await request(httpServer)
        .get(`/comments/story/${storyId}`)
        .expect(200);

      expect(res.body).toHaveProperty('comments');
      expect(Array.isArray(res.body.comments)).toBe(true);
    });
  });

  describe('PATCH /comments/:commentId', () => {
    it('should update a comment', async () => {
      const res = await request(httpServer)
        .patch(`/comments/${commentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ content: 'Updated comment' })
        .expect(200);

      expect(res.body.content).toBe('Updated comment');
    });
  });

  describe('DELETE /comments/:commentId', () => {
    it('should delete a comment', async () => {
      const res = await request(httpServer)
        .delete(`/comments/${commentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('message');
    });
  });
});
