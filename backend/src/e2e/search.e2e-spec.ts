import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module.js';

describe('Search E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/search/stories (GET)', () => {
    it('should search stories', () => {
      return request(app.getHttpServer())
        .get('/search/stories?q=test')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('items');
          expect(res.body).toHaveProperty('total');
          expect(Array.isArray(res.body.items)).toBe(true);
        });
    });
  });

  describe('/search/suggestions (GET)', () => {
    it('should return search suggestions', () => {
      return request(app.getHttpServer())
        .get('/search/suggestions?q=test')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });
});
