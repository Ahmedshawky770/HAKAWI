import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module.js';

describe('Notifications E2E', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'notif-e2e@example.com',
        password: 'SecurePass123!',
        name: 'Notification User',
        username: 'notife2e',
      });

    accessToken = registerRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/notifications (GET)', () => {
    it('should return notifications for user', () => {
      return request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('/notifications/unread-count (GET)', () => {
    it('should return unread count', () => {
      return request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('count');
          expect(typeof res.body.count).toBe('number');
        });
    });
  });
});
