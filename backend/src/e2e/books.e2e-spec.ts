import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module.js';

describe('Books E2E', () => {
  let app: INestApplication;
  let accessToken: string;
  let ownerId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'bookowner-e2e@example.com',
        password: 'SecurePass123!',
        name: 'Book Owner',
        username: 'bookownere2e',
      });

    ownerId = registerRes.body.user.id;
    accessToken = registerRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/books (POST)', () => {
    it('should create a book', () => {
      return request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'E2E Test Book',
          authorName: 'Test Author',
          price: 9.99,
          isAvailable: true,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.title).toBe('E2E Test Book');
        });
    });
  });

  describe('/books (GET)', () => {
    it('should return published books', () => {
      return request(app.getHttpServer())
        .get('/books/published')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });
});
