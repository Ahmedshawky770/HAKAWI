import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from './../src/app.module.ts';
import { WinstonLoggerService } from './../src/common/services/winston-logger.service.ts';
import { ValkeyService } from './../src/common/services/valkey.service.ts';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EncryptionService } from './../src/common/utils/encryption.util.ts';
import { UsersEventHandler } from './../src/modules/users/events/users.event-handler.ts';
import { AdminDashboardController } from './../src/modules/moderation/admin-dashboard.controller.ts';
import { ModerationController } from './../src/modules/moderation/moderation.controller.ts';
import { db } from './../src/db/index.ts';
import { users } from './../src/db/schema/users.schema.ts';

describe('Moderation Integration', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;
  let adminUserId: string;
  let userToken: string;
  let userId: string;
  let reportId: string;

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

    const adminRegisterRes = await request(httpServer)
      .post('/auth/register')
      .send({
        email: 'admin-mod-int@example.com',
        password: 'SecurePass123!',
        name: 'Admin Mod Int',
        username: 'adminmodint',
        accountType: 'admin',
      });

    adminToken = adminRegisterRes.body.tokens.accessToken;
    adminUserId = adminRegisterRes.body.user.id;

    const userRegisterRes = await request(httpServer)
      .post('/auth/register')
      .send({
        email: 'user-mod-int@example.com',
        password: 'SecurePass123!',
        name: 'User Mod Int',
        username: 'usermodint',
      });

    userToken = userRegisterRes.body.tokens.accessToken;
    userId = userRegisterRes.body.user.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(() => {
    // no mocks to clear
  });

  describe('POST /moderation/reports', () => {
    it('should create a new report', async () => {
      const res = await request(httpServer)
        .post('/moderation/reports')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ targetId: userId, targetType: 'user', reason: 'spam' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      reportId = res.body.id;
    });
  });

  describe('GET /moderation/stats', () => {
    it('should return admin stats for super admin', async () => {
      const res = await request(httpServer)
        .get('/moderation/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalReports');
      expect(res.body).toHaveProperty('openReports');
      expect(res.body).toHaveProperty('totalActions');
    });

    it('should return 403 for non-super-admin', async () => {
      await request(httpServer)
        .get('/moderation/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });
  });

  describe('GET /moderation/users/:id/restrictions', () => {
    it('should return own restrictions', async () => {
      const res = await request(httpServer)
        .get(`/moderation/users/${userId}/restrictions`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('restrictions');
      expect(Array.isArray(res.body.restrictions)).toBe(true);
    });

    it('should return restrictions for another user', async () => {
      const res = await request(httpServer)
        .get(`/moderation/users/${userId}/restrictions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('restrictions');
      expect(Array.isArray(res.body.restrictions)).toBe(true);
    });
  });

  describe('GET /moderation/reports/trends', () => {
    it('should return report trends', async () => {
      const res = await request(httpServer)
        .get('/moderation/reports/trends?days=7')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(typeof res.body).toBe('object');
    });

    it('should return 403 for non-admin', async () => {
      await request(httpServer)
        .get('/moderation/reports/trends?days=7')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });
  });
});
