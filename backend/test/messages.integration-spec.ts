import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';

import { AppModule } from '../src/app.module.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';
import { UsersEventHandler } from '../src/modules/users/events/users.event-handler.ts';
import { SanityService } from '../src/modules/stories/sanity/sanity.service.ts';

describe('Messages Integration', () => {
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
        email: 'messages-int-1@example.com',
        password: 'SecurePass123!',
        name: 'Messages Integration User 1',
        username: 'messagesint1',
      });

    accessToken1 = registerRes1.body.tokens.accessToken;
    userId1 = registerRes1.body.user.id;

    const registerRes2 = await request(httpServer)
      .post('/auth/register')
      .send({
        email: 'messages-int-2@example.com',
        password: 'SecurePass123!',
        name: 'Messages Integration User 2',
        username: 'messagesint2',
      });

    accessToken2 = registerRes2.body.tokens.accessToken;
    userId2 = registerRes2.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /messages/conversations', () => {
    it('should create a conversation', async () => {
      const res = await request(httpServer)
        .post('/messages/conversations')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({ participantIds: [userId2] })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.participantIds).toEqual(expect.arrayContaining([userId2]));
    });
  });

  describe('GET /messages/conversations', () => {
    it('should get conversations for current user', async () => {
      const res = await request(httpServer)
        .get('/messages/conversations')
        .set('Authorization', `Bearer ${accessToken1}`)
        .expect(200);

      expect(res.body).toHaveProperty('conversations');
      expect(Array.isArray(res.body.conversations)).toBe(true);
    });
  });

  describe('GET /messages/conversations/:conversationId/messages', () => {
    it('should get messages for a conversation', async () => {
      const conversationRes = await request(httpServer)
        .post('/messages/conversations')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({ participantIds: [userId2] });

      const conversationId = conversationRes.body.id;

      const res = await request(httpServer)
        .get(`/messages/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${accessToken1}`)
        .expect(200);

      expect(res.body).toHaveProperty('messages');
      expect(Array.isArray(res.body.messages)).toBe(true);
    });
  });
});
