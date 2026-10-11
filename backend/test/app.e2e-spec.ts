import type { Server } from 'node:http';

import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AppModule } from './../src/app.module.ts';
import type { HealthResponse } from './../src/app.controller.ts';
import { WinstonLoggerService } from './../src/common/services/winston-logger.service.ts';
import { ValkeyService } from './../src/common/services/valkey.service.ts';
import { UsersRepository } from './../src/modules/users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from './../src/modules/users/interfaces/users-repository.interface.ts';

describe('AppController (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
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

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expect(res.body).toMatchObject({ prefix: 'api/v1' });
  });

  it('/health (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toMatchObject({
      database: 'connected',
      valkey: 'connected',
    });

    const body = res.body as HealthResponse;

    expect(['healthy', 'degraded']).toContain(body.status);
  });

  it('/ (GET) requires no authentication', async () => {
    await request(app.getHttpServer()).get('/').expect(200);
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer()).get('/api/v1').expect(404);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});
