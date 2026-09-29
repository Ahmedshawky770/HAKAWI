import { type Server } from 'http';

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';

import { AppModule } from '../../../app.module.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { UsersRepository } from '../../../modules/users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../../../modules/users/interfaces/users-repository.interface.ts';

// drizzle-ORM db and sql template tags, plus supertest response chains, are typed as `any` by their libraries.
// Accepted external-library typing limitations — no production code change.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unused-vars */

describe('Books E2E', () => {
  let app: INestApplication;
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
    httpServer = app.getHttpServer() as Server;

    const registerRes = await request(httpServer)
      .post('/auth/register')
      .send({
        email: 'e2e-books@example.com',
        password: 'SecurePass123!',
        name: 'E2E Books User',
        username: 'e2ebooks',
      });

    const loginRes = await request(httpServer)
      .post('/auth/login')
      .send({
        email: 'e2e-books@example.com',
        password: 'SecurePass123!',
      });

    accessToken = loginRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /books', () => {
    it('should return books', async () => {
      const res = await request(httpServer)
        .get('/books')
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
      expect(res.body.title).toBe('E2E Test Book');
    });
  });
});
