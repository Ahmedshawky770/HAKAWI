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
import { payments } from '../../../db/schema/payments.schema.ts';

// drizzle-ORM db and sql template tags, plus supertest response chains, are typed as `any` by their libraries.
// Accepted external-library typing limitations — no production code change.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

describe('Payments E2E', () => {
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
        email: 'e2e-payments@example.com',
        password: 'SecurePass123!',
        name: 'E2E Payments User',
        username: 'e2epayments',
      });

    const loginRes = await request(httpServer)
      .post('/auth/login')
      .send({
        email: 'e2e-payments@example.com',
        password: 'SecurePass123!',
      });

    accessToken = loginRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /payments', () => {
    it('should create a payment', async () => {
      const res = await request(httpServer)
        .post('/payments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 1000, paymentMethod: 'paymob' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.amount).toBe(1000);
    });
  });

  describe('GET /payments', () => {
    it('should return my payments', async () => {
      const res = await request(httpServer)
        .get('/payments')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('payments');
      expect(res.body).toHaveProperty('total');
    });
  });
});
