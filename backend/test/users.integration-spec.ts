import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';

import { AppModule } from '../src/app.module.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';
import { UsersEventHandler } from '../src/modules/users/events/users.event-handler.ts';
import { SanityService } from '../src/modules/stories/sanity/sanity.service.ts';

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
        email: 'users-int@example.com',
        password: 'SecurePass123!',
        name: 'Users Integration User',
        username: 'usersint',
      });

    accessToken = registerRes.body.tokens.accessToken;
    userId = registerRes.body.user.id;
  });

  afterAll(async () => {
    await app.close();
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
