import { type Server } from 'http';

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';

import { AppModule } from '../../../app.module.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { EncryptionService } from '../../../common/utils/encryption.util.ts';
import { UsersRepository } from '../../../modules/users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../../../modules/users/interfaces/users-repository.interface.ts';
import { UsersEventHandler } from '../../../modules/users/events/users.event-handler.ts';
import { books } from '../../../db/schema/books.schema.ts';
import { rentals } from '../../../db/schema/rentals.schema.ts';

// drizzle-ORM db and sql template tags, plus supertest response chains, are typed as `any` by their libraries.
// Accepted external-library typing limitations — no production code change.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

describe('Rentals E2E', () => {
  let app: INestApplication;
  let httpServer: Server;
  let accessToken: string;
  let bookId: string;

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
    httpServer = app.getHttpServer() as Server;

    await request(httpServer)
      .post('/auth/register')
      .send({
        email: 'e2e-rentals@example.com',
        password: 'SecurePass123!',
        name: 'E2E Rentals User',
        username: 'e2erentals',
      });

    const loginRes = await request(httpServer)
      .post('/auth/login')
      .send({
        email: 'e2e-rentals@example.com',
        password: 'SecurePass123!',
      });

    accessToken = loginRes.body.tokens.accessToken;

    const bookRes = await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'E2E Rental Book', author: 'Test Author' });

    bookId = bookRes.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /rentals', () => {
    it('should create a rental', async () => {
      const res = await request(httpServer)
        .post('/rentals')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bookId })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('active');
    });
  });

  describe('GET /rentals/my', () => {
    it('should return my rentals', async () => {
      const res = await request(httpServer)
        .get('/rentals/my')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('rentals');
      expect(res.body).toHaveProperty('total');
    });
  });
});
