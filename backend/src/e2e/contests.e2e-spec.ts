import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module.js';

describe('Contests E2E', () => {
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
        email: 'publisher-e2e@example.com',
        password: 'SecurePass123!',
        name: 'Publisher User',
        username: 'publishere2e',
      });

    accessToken = registerRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/contests (POST)', () => {
    it('should create a contest', () => {
      return request(app.getHttpServer())
        .post('/contests')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'E2E Test Contest',
          theme: 'Writing',
          description: 'Test contest',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          submissionDeadline: '2024-06-01',
          prizeType: 'cash',
          prizeAmount: 100,
          maxParticipants: 100,
          rules: 'Follow rules',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.title).toBe('E2E Test Contest');
        });
    });
  });

  describe('/contests (GET)', () => {
    it('should return published contests', () => {
      return request(app.getHttpServer())
        .get('/contests/published')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });
});
