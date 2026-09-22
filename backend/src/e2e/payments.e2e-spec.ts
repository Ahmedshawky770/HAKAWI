import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module.js';

describe('Payments E2E', () => {
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
        email: 'payment-e2e@example.com',
        password: 'SecurePass123!',
        name: 'Payment User',
        username: 'paymente2e',
      });

    accessToken = registerRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/payments (POST)', () => {
    it('should create a payment', () => {
      return request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 9.99,
          currency: 'USD',
          paymentMethodId: 'pm_123',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.status).toBe('pending');
        });
    });
  });

  describe('/payments/history (GET)', () => {
    it('should return payment history', () => {
      return request(app.getHttpServer())
        .get('/payments/history')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });
});
