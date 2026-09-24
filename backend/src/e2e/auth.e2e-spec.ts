import { type Server } from 'http';

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../app.module.ts';
import { WinstonLoggerService } from '../common/services/winston-logger.service.ts';
import { ValkeyService } from '../common/services/valkey.service.ts';
import { UsersRepository } from '../modules/users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../modules/users/interfaces/users-repository.interface.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema/users.schema.ts';

interface RegisterResponseBody {
  user: {
    email: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

interface LoginResponseBody {
  tokens: {
    accessToken: string;
  };
}

interface SessionResponseBody {
  user: {
    email: string;
  };
}

describe('Auth E2E', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    try {
      await db.delete(users).where(sql`email LIKE 'e2e-%' OR email LIKE '%@example.com'`);
    } catch {
      // ignore cleanup errors
    }

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
  });

  afterAll(async () => {
    if (app) {
      try {
        await db.delete(users).where(sql`email LIKE 'e2e-%' OR email LIKE '%@example.com'`);
      } catch {
        // ignore cleanup errors
      }
      await app.close();
    }
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', async () => {
      const res = await request(httpServer)
        .post('/auth/register')
        .send({
          email: 'e2e-register@example.com',
          password: 'SecurePass123!',
          name: 'E2E Register User',
          username: 'e2eregister',
        })
        .expect(201);

      const body = res.body as RegisterResponseBody;
      expect(body).toHaveProperty('user');
      expect(body).toHaveProperty('tokens');
      expect(body.tokens).toHaveProperty('accessToken');
      expect(body.tokens).toHaveProperty('refreshToken');
      expect(body.user.email).toBe('e2e-register@example.com');
    });

    it('should return 409 for duplicate email', async () => {
      await request(httpServer)
        .post('/auth/register')
        .send({
          email: 'e2e-register@example.com',
          password: 'SecurePass123!',
          name: 'E2E Register User',
          username: 'e2eregister',
        });

      await request(httpServer)
        .post('/auth/register')
        .send({
          email: 'e2e-register@example.com',
          password: 'SecurePass123!',
          name: 'E2E Register User 2',
          username: 'e2eregister2',
        })
        .expect(409);
    });
  });

  describe('/auth/login (POST)', () => {
    it('should login with valid credentials', async () => {
      await request(httpServer)
        .post('/auth/register')
        .send({
          email: 'e2e-login@example.com',
          password: 'SecurePass123!',
          name: 'E2E Login User',
          username: 'e2elogin',
        });

      const res = await request(httpServer)
        .post('/auth/login')
        .send({
          email: 'e2e-login@example.com',
          password: 'SecurePass123!',
        })
        .expect(200);

      const body = res.body as LoginResponseBody;
      expect(body).toHaveProperty('tokens');
      expect(body.tokens).toHaveProperty('accessToken');
    });

    it('should return 401 for invalid credentials', async () => {
      await request(httpServer)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'WrongPassword',
        })
        .expect(401);
    });
  });

  describe('/auth/session (GET)', () => {
    it('should return session with valid token', async () => {
      await request(httpServer)
        .post('/auth/register')
        .send({
          email: 'e2e-session@example.com',
          password: 'SecurePass123!',
          name: 'E2E Session User',
          username: 'e2esession',
        });

      const loginRes = await request(httpServer)
        .post('/auth/login')
        .send({
          email: 'e2e-session@example.com',
          password: 'SecurePass123!',
        });

      const loginBody = loginRes.body as LoginResponseBody;
      const accessToken = loginBody.tokens.accessToken;

      await request(httpServer)
        .get('/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as SessionResponseBody;
          expect(body).toHaveProperty('user');
          expect(body.user.email).toBe('e2e-session@example.com');
        });
    });
  });
});
