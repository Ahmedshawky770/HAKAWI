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

describe('Search Integration', () => {
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
        email: 'search-int@example.com',
        password: 'SecurePass123!',
        name: 'Search Integration User',
        username: 'searchint',
      });

    accessToken = registerRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /search', () => {
    it('should return 400 when no query provided', async () => {
      await request(httpServer)
        .get('/search')
        .expect(400);
    });

    it('should search stories with query', async () => {
      const res = await request(httpServer)
        .get('/search?query=test')
        .expect(200);

      expect(res.body).toHaveProperty('results');
      expect(res.body).toHaveProperty('total');
    });

    it('should search stories with filters', async () => {
      const res = await request(httpServer)
        .get('/search?query=test&status=published&page=1&limit=10')
        .expect(200);

      expect(res.body).toHaveProperty('results');
      expect(res.body).toHaveProperty('total');
    });
  });

  describe('GET /search/authors', () => {
    it('should return 400 when query parameter q is missing', async () => {
      await request(httpServer)
        .get('/search/authors')
        .expect(400);
    });

    it('should search authors by name', async () => {
      const res = await request(httpServer)
        .get('/search/authors?q=test')
        .expect(200);

      expect(res.body).toHaveProperty('authors');
      expect(res.body).toHaveProperty('total');
    });
  });

  describe('GET /search/categories', () => {
    it('should return 400 when query parameter q is missing', async () => {
      await request(httpServer)
        .get('/search/categories')
        .expect(400);
    });

    it('should search categories by name', async () => {
      const res = await request(httpServer)
        .get('/search/categories?q=tech')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
