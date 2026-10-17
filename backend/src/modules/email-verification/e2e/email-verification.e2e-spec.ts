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

describe('Email Verification E2E', () => {
  let app: INestApplication<Server>;
  let httpServer: Server;

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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /auth/resend-verification', () => {
    it('should resend verification email', async () => {
      await request(httpServer).post('/auth/register').send({
        email: 'e2e-verify@example.com',
        password: 'SecurePass123!',
        name: 'E2E Verify User',
        username: 'e2everify',
      });

      const res = await request(httpServer)
        .post('/auth/resend-verification')
        .send({ email: 'e2e-verify@example.com' })
        .expect(200);

      // The response used to be the constant 'Verification email sent' with no mail ever attempted.
      // It is now derived from the delivery outcome, so the only contract this endpoint makes is
      // "the request succeeded"; whether a mail went out is decided by the SMTP configuration the
      // environment supplies. See the module README's table of outcomes.
      expect((res.body as { message: string }).message).toMatch(
        /^(Verification email sent|Verification email could not be sent\. Please try again later or contact support\.)$/,
      );
    });
  });
});
