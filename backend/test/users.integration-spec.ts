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

describe('Users Integration', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  let accessToken: string;
  let userId: string;

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
        email: 'users-int@example.com',
        password: 'SecurePass123!',
        name: 'Users Integration User',
        username: 'usersint',
      });

    accessToken = registerRes.body.tokens.accessToken;
    userId = registerRes.body.user.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /users/me', () => {
    it('should get current user profile', async () => {
      const res = await request(httpServer)
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe('users-int@example.com');
    });
  });

  describe('PATCH /users/me', () => {
    it('should update current user profile', async () => {
      const res = await request(httpServer)
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.name).toBe('Updated Name');
    });
  });

  describe('GET /users/:id', () => {
    it('should get a user by id', async () => {
      const res = await request(httpServer)
        .get(`/users/${userId}`)
        .expect(200);

      expect(res.body.id).toBe(userId);
    });

    it('should return 404 when user not found', async () => {
      await request(httpServer)
        .get('/users/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });
});
