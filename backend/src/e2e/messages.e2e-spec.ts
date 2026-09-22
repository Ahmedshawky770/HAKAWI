import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module.js';

describe('Messages E2E', () => {
  let app: INestApplication;
  let accessToken1: string;
  let accessToken2: string;
  let userId1: string;
  let userId2: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const registerRes1 = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'user1-e2e@example.com',
        password: 'SecurePass123!',
        name: 'User One',
        username: 'user1e2e',
      });

    userId1 = registerRes1.body.user.id;
    accessToken1 = registerRes1.body.tokens.accessToken;

    const registerRes2 = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'user2-e2e@example.com',
        password: 'SecurePass123!',
        name: 'User Two',
        username: 'user2e2e',
      });

    userId2 = registerRes2.body.user.id;
    accessToken2 = registerRes2.body.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/conversations (POST)', () => {
    it('should create a conversation', async () => {
      return request(app.getHttpServer())
        .post('/conversations')
        .set('Authorization', `Bearer ${accessToken1}`)
        .send({
          participantIds: [userId1, userId2],
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.participantIds).toContain(userId1);
          expect(res.body.participantIds).toContain(userId2);
        });
    });
  });
});
