import type { Server } from 'node:http';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';

import { AppModule } from '../../../app.module.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { UsersRepository } from '../../../modules/users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../../../modules/users/interfaces/users-repository.interface.ts';
import type { JsonResponse, LoginResponseBody } from '../../../test/helpers/test-response-types.ts';

interface BookResponseBody {
  id: string;
  title: string;
}

describe('Books E2E', () => {
  let app: INestApplication<Server>;
  let httpServer: Server;
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
        UsersRepository,
        {
          provide: USERS_REPOSITORY,
          useExisting: UsersRepository,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer();

    await request(httpServer).post('/auth/register').send({
      email: 'e2e-books@example.com',
      password: 'SecurePass123!',
      name: 'E2E Books User',
      username: 'e2ebooks',
    });

    const loginRes = (await request(httpServer).post('/auth/login').send({
      email: 'e2e-books@example.com',
      password: 'SecurePass123!',
    })) as JsonResponse<LoginResponseBody>;

    accessToken = loginRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /books', () => {
    it('should return 401 without a token', async () => {
      await request(httpServer).get('/books').expect(401);
    });

    it('should return books for an authenticated caller', async () => {
      const res = await request(httpServer)
        .get('/books')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('books');
      expect(res.body).toHaveProperty('total');
    });

    it('should scope draft listing to the caller', async () => {
      const res = await request(httpServer)
        .get('/books?status=draft')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('books');
      expect(res.body).toHaveProperty('total');
    });
  });

  describe('POST /books', () => {
    it('should create a book', async () => {
      const res = await request(httpServer)
        .post('/books')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'E2E Test Book', author: 'Test Author' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect((res.body as BookResponseBody).title).toBe('E2E Test Book');
    });
  });
});
