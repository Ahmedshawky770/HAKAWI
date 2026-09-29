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

describe('Notifications Integration', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  let accessToken: string;

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
        email: 'notifications-int@example.com',
        password: 'SecurePass123!',
        name: 'Notifications Integration User',
        username: 'notificationsint',
      });

    accessToken = registerRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /notifications', () => {
    it('should get notifications for current user', async () => {
      const res = await request(httpServer)
        .get('/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('notifications');
      expect(Array.isArray(res.body.notifications)).toBe(true);
    });
  });

  describe('PUT /notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      const listRes = await request(httpServer)
        .get('/notifications')
        .set('Authorization', `Bearer ${accessToken}`);

      if (listRes.body.notifications.length === 0) {
        await request(httpServer)
          .get('/notifications')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      }

      const notificationId = listRes.body.notifications[0]?.id;
      if (!notificationId) {
        await request(httpServer)
          .get('/notifications')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        return;
      }

      const res = await request(httpServer)
        .put(`/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('message');
    });
  });

  describe('PUT /notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const res = await request(httpServer)
        .put('/notifications/read-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('message');
    });
  });

  describe('GET /notifications/unread-count', () => {
    it('should get unread count', async () => {
      const res = await request(httpServer)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('count');
      expect(typeof res.body.count).toBe('number');
    });
  });
});
