import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../src/app.module.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';
import { UsersEventHandler } from '../src/modules/users/events/users.event-handler.ts';
import { SanityService } from '../src/modules/stories/sanity/sanity.service.ts';
import { db } from '../src/db/index.ts';
import { users } from '../src/db/schema/users.schema.ts';

describe('Auth Integration', () => {
  let app: INestApplication;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  let registeredEmail: string;
  let registeredUsername: string;

  beforeAll(async () => {
    try {
      await db.delete(users).where(sql`email LIKE '%-int@example.com' OR email LIKE '%-register@example.com' OR email LIKE '%-login@example.com' OR email LIKE '%-session@example.com' OR email LIKE '%-forgot@example.com' OR email LIKE '%-reset@example.com' OR email LIKE '%-e2e@example.com'`);
    } catch {
      // ignore cleanup errors
    }

    const timestamp = Date.now();
    registeredEmail = `auth-int-${timestamp}@example.com`;
    registeredUsername = `authint-${timestamp}`;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: 'REFLECTOR',
          useValue: new Reflector(),
        },
        {
          provide: WinstonLoggerService,
          useValue: {
            info: () => {},
            log: () => {},
            error: () => {},
            warn: () => {},
            debug: () => {},
            verbose: () => {},
          },
        },
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
    .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    try {
      await db.delete(users).where(sql`email LIKE '%-int@example.com' OR email LIKE '%-register@example.com' OR email LIKE '%-login@example.com' OR email LIKE '%-session@example.com' OR email LIKE '%-forgot@example.com' OR email LIKE '%-reset@example.com' OR email LIKE '%-e2e@example.com'`);
    } catch {
      // ignore cleanup errors
    }
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(httpServer)
        .post('/auth/register')
        .send({
          email: registeredEmail,
          password: 'SecurePass123!',
          name: 'Auth Integration User',
          username: registeredUsername,
        })
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(registeredEmail);
      expect(res.body).toHaveProperty('tokens');
      expect(res.body.tokens).toHaveProperty('accessToken');
    });

    it('should return 409 when email is already registered', async () => {
      const timestamp = Date.now();
      const email = `auth-int-dup-${timestamp}@example.com`;
      const username = `authint-dup-${timestamp}`;

      await request(httpServer)
        .post('/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          name: 'Auth Integration User',
          username,
        })
        .expect(201);

      await request(httpServer)
        .post('/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          name: 'Auth Integration User',
          username,
        })
        .expect(409);
    });

    it('should return 409 when username is already taken', async () => {
      const timestamp = Date.now();
      const email = `auth-int-dup2-${timestamp}@example.com`;
      const username = `authint-dup2-${timestamp}`;

      await request(httpServer)
        .post('/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          name: 'Auth Integration User',
          username,
        })
        .expect(201);

      await request(httpServer)
        .post('/auth/register')
        .send({
          email: `auth-int-dup2b-${timestamp}@example.com`,
          password: 'SecurePass123!',
          name: 'Auth Integration User 2',
          username,
        })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const timestamp = Date.now();
      const email = `auth-int-login-${timestamp}@example.com`;

      await request(httpServer)
        .post('/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          name: 'Auth Login User',
          username: `authint-login-${timestamp}`,
        })
        .expect(201);

      const res = await request(httpServer)
        .post('/auth/login')
        .send({
          email,
          password: 'SecurePass123!',
        })
        .expect(200);

      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('tokens');
      expect(res.body.tokens).toHaveProperty('accessToken');
    });

    it('should return 401 with invalid email', async () => {
      await request(httpServer)
        .post('/auth/login')
        .send({
          email: 'wrong@example.com',
          password: 'SecurePass123!',
        })
        .expect(401);
    });

    it('should return 401 with invalid password', async () => {
      await request(httpServer)
        .post('/auth/login')
        .send({
          email: registeredEmail,
          password: 'WrongPassword',
        })
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const timestamp = Date.now();
      const email = `auth-int-refresh-${timestamp}@example.com`;

      await request(httpServer)
        .post('/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          name: 'Auth Refresh User',
          username: `authint-refresh-${timestamp}`,
        })
        .expect(201);

      const loginRes = await request(httpServer)
        .post('/auth/login')
        .send({
          email,
          password: 'SecurePass123!',
        })
        .expect(200);

      const refreshToken = loginRes.body.tokens?.refreshToken;
      expect(refreshToken).toBeDefined();

      const res = await request(httpServer)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('tokens');
      expect(res.body.tokens).toHaveProperty('accessToken');
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should accept email and return success', async () => {
      const res = await request(httpServer)
        .post('/auth/forgot-password')
        .send({ email: registeredEmail })
        .expect(200);

      expect(res.body).toHaveProperty('message');
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should accept reset token and return success', async () => {
      const timestamp = Date.now();
      const email = `auth-int-reset-${timestamp}@example.com`;

      await request(httpServer)
        .post('/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          name: 'Auth Reset User',
          username: `authint-reset-${timestamp}`,
        })
        .expect(201);

      await request(httpServer)
        .post('/auth/forgot-password')
        .send({ email })
        .expect(200);

      const result = await db.execute(sql`
        SELECT email_verification_token FROM users WHERE email = ${email}
      `);
      const token = result.rows?.[0]?.email_verification_token;
      expect(token).toBeDefined();

      const res = await request(httpServer)
        .post('/auth/reset-password')
        .send({ token, password: 'NewPass123!' })
        .expect(200);

      expect(res.body).toHaveProperty('message');
    });
  });
});
