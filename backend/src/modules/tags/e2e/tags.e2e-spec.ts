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
import { tags } from '../../../db/schema/stories.schema.ts';

// drizzle-ORM db and sql template tags, plus supertest response chains, are typed as `any` by their libraries.
// Accepted external-library typing limitations — no production code change.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-template-expressions */

describe('Tags E2E', () => {
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
        email: 'e2e-tags@example.com',
        password: 'SecurePass123!',
        name: 'E2E Tags User',
        username: 'e2etags',
      });

    const loginRes = await request(httpServer)
      .post('/auth/login')
      .send({
        email: 'e2e-tags@example.com',
        password: 'SecurePass123!',
      });

    accessToken = loginRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /tags', () => {
    it('should return tags', async () => {
      const res = await request(httpServer)
        .get('/tags')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /tags', () => {
    it('should create a tag', async () => {
      const res = await request(httpServer)
        .post('/tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'E2E Romance', slug: 'e2e-romance' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('E2E Romance');
    });
  });

  describe('PATCH /tags/:id', () => {
    it('should update a tag', async () => {
      const createRes = await request(httpServer)
        .post('/tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'E2E Romance Update', slug: 'e2e-romance-update' });

      const tagId = createRes.body.id;

      const res = await request(httpServer)
        .patch(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'E2E Romance Updated' })
        .expect(200);

      expect(res.body.name).toBe('E2E Romance Updated');
    });
  });
});
