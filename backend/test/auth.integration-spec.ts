import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';

import { AppModule } from '../src/app.module.ts';
import { WinstonLoggerService } from '../src/common/services/winston-logger.service.ts';

describe('Auth Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: 'REFLECTOR',
          useValue: new Reflector(),
        },
        WinstonLoggerService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'integration-register@example.com',
          password: 'SecurePass123!',
          name: 'Integration Register User',
          username: 'intregister',
        })
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('tokens');
      expect(res.body.tokens).toHaveProperty('accessToken');
      expect(res.body.tokens).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe('integration-register@example.com');
    });

    it('should return 409 for duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'integration-register@example.com',
          password: 'SecurePass123!',
          name: 'Integration Register User 2',
          username: 'intregister2',
        });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'integration-register@example.com',
          password: 'SecurePass123!',
          name: 'Integration Register User 2',
          username: 'intregister3',
        })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'integration-login@example.com',
          password: 'SecurePass123!',
          name: 'Integration Login User',
          username: 'intlogin',
        });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'integration-login@example.com',
          password: 'SecurePass123!',
        })
        .expect(200);

      expect(res.body).toHaveProperty('tokens');
      expect(res.body.tokens).toHaveProperty('accessToken');
    });

    it('should return 401 for invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'WrongPassword',
        })
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'integration-refresh@example.com',
          password: 'SecurePass123!',
          name: 'Integration Refresh User',
          username: 'intrefresh',
        });

      const refreshToken = registerRes.body.tokens.refreshToken;

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });
  });

  describe('GET /auth/session', () => {
    it('should return session with valid token', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'integration-session@example.com',
          password: 'SecurePass123!',
          name: 'Integration Session User',
          username: 'intsession',
        });

      const accessToken = registerRes.body.tokens.accessToken;

      const res = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('email');
      expect(res.body.user.email).toBe('integration-session@example.com');
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/auth/session')
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout and blacklist refresh token', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'integration-logout@example.com',
          password: 'SecurePass123!',
          name: 'Integration Logout User',
          username: 'intlogout',
        });

      const refreshToken = registerRes.body.tokens.refreshToken;

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('message');
    });
  });
});
