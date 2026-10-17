import type { Server } from 'node:http';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
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
import type { IdResponse, JsonResponse, LoginResponseBody } from '../../../test/helpers/test-response-types.ts';

describe('Rentals E2E', () => {
  let app: INestApplication<Server>;
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
      .overrideProvider(UsersEventHandler)
      .useValue({
        handleUserRegistered: () => Promise.resolve(),
        handleUserUpdated: () => Promise.resolve(),
      })
      .overrideProvider(EncryptionService)
      .useValue({
        encrypt: (plaintext: string) => plaintext,
        decrypt: (ciphertext: string) => ciphertext,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer();

    await request(httpServer).post('/auth/register').send({
      email: 'e2e-rentals@example.com',
      password: 'SecurePass123!',
      name: 'E2E Rentals User',
      username: 'e2erentals',
    });

    const loginRes = (await request(httpServer).post('/auth/login').send({
      email: 'e2e-rentals@example.com',
      password: 'SecurePass123!',
    })) as JsonResponse<LoginResponseBody>;

    accessToken = loginRes.body.tokens.accessToken;

    const bookRes = (await request(httpServer)
      .post('/books')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'E2E Rental Book', author: 'Test Author' })) as JsonResponse<IdResponse>;

    bookId = bookRes.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /rentals', () => {
    // The free-rental door is gone. This route used to create an ACTIVE rental with no payment —
    // the entitlement for the price of one request — which made the whole payment-first redesign
    // of rentals bypassable. A rental now exists only after `POST /books/:id/rent` takes the money
    // and `payment.completed` arrives; the route is pinned as a 404 so it cannot come back quietly.
    it('no longer exists', async () => {
      await request(httpServer)
        .post('/rentals')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ bookId })
        .expect(404);
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
