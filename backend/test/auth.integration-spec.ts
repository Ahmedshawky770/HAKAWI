import { sql } from 'drizzle-orm';
import request from 'supertest';

import { db } from '../src/db/index.ts';
import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext } from '../src/test/helpers/test-context.ts';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

describe('Auth Integration', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  const registerRaw = (email: string, username: string) =>
    request(context.httpServer)
      .post('/auth/register')
      .send({ email, username, name: 'Auth Integration User', password: 'SecurePass123!' });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const email = context.uniqueEmail('auth');
      const username = context.uniqueUsername('auth');

      const res = await registerRaw(email, username).expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(email);
      expect(res.body).toHaveProperty('tokens');
    });

    it('should return 409 when email is already registered', async () => {
      const email = context.uniqueEmail('auth');
      const username = context.uniqueUsername('auth');

      await registerRaw(email, username).expect(201);
      await registerRaw(email, context.uniqueUsername('auth')).expect(409);
    });

    it('should return 409 when username is already taken', async () => {
      const username = context.uniqueUsername('auth');

      await registerRaw(context.uniqueEmail('auth'), username).expect(201);
      await registerRaw(context.uniqueEmail('auth'), username).expect(409);
    });

    it('should never mint a privileged account from a body-supplied accountType', async () => {
      const email = context.uniqueEmail('auth');
      const username = context.uniqueUsername('auth');

      const res = await request(context.httpServer)
        .post('/auth/register')
        .send({ email, username, name: 'Escalation Attempt', password: 'SecurePass123!', accountType: 'admin' })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('accountType');
    });

    it('should create a reader account and deny it moderation access', async () => {
      const created = await context.registerAndLogin({ prefix: 'readeronly' });

      expect(created.accountType).toBe('reader');

      const me = await request(context.httpServer)
        .get('/users/me')
        .set('Authorization', `Bearer ${created.accessToken}`)
        .expect(200);

      expect(me.body.accountType).toBe('reader');

      await request(context.httpServer)
        .get('/moderation/stats')
        .set('Authorization', `Bearer ${created.accessToken}`)
        .expect(403);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const user = await context.registerUser({ prefix: 'authlogin' });

      const res = await request(context.httpServer)
        .post('/auth/login')
        .send({ email: user.email, password: 'SecurePass123!' })
        .expect(200);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(user.email);
    });

    it('should return 401 with invalid email', async () => {
      await request(context.httpServer)
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'SecurePass123!' })
        .expect(401);
    });

    it('should return 401 with invalid password', async () => {
      const user = await context.registerUser({ prefix: 'authlogin' });

      await request(context.httpServer)
        .post('/auth/login')
        .send({ email: user.email, password: 'WrongPassword' })
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const user = await context.registerUser({ prefix: 'authrefresh' });

      const loginRes = await request(context.httpServer)
        .post('/auth/login')
        .send({ email: user.email, password: 'SecurePass123!' })
        .expect(200);

      const cookies: unknown = loginRes.headers['set-cookie'];
      const cookieList: string[] = Array.isArray(cookies)
        ? cookies.filter((entry): entry is string => typeof entry === 'string')
        : [];
      const refreshTokenCookie = cookieList.find((cookie) => cookie.startsWith('refresh_token='));
      const refreshToken = refreshTokenCookie?.split(';')[0]?.split('=')[1];
      expect(refreshToken).toBeDefined();

      const res = await request(context.httpServer).post('/auth/refresh').send({ refreshToken }).expect(200);

      expect(res.body).toHaveProperty('tokens');
      expect(res.body.tokens).toHaveProperty('accessToken');
    });

    it('should return 401 for an unknown refresh token', async () => {
      await request(context.httpServer).post('/auth/refresh').send({ refreshToken: 'not-a-real-token' }).expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should revoke the refresh token', async () => {
      const user = await context.registerUser({ prefix: 'authlogout' });

      const loginRes = await request(context.httpServer)
        .post('/auth/login')
        .send({ email: user.email, password: 'SecurePass123!' })
        .expect(200);

      const refreshToken: string = loginRes.body.tokens.refreshToken;

      await request(context.httpServer).post('/auth/logout').send({ refreshToken }).expect(200);

      await request(context.httpServer).post('/auth/refresh').send({ refreshToken }).expect(401);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should accept email and return success', async () => {
      const user = await context.registerUser({ prefix: 'authforgot' });

      const res = await request(context.httpServer)
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      expect(res.body).toHaveProperty('message');
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should accept the reset token stored by forgot-password', async () => {
      const user = await context.registerUser({ prefix: 'authreset' });

      await request(context.httpServer).post('/auth/forgot-password').send({ email: user.email }).expect(200);

      const result = await db.execute(sql`
        SELECT password_reset_token FROM users WHERE email = ${user.email}
      `);
      const token: unknown = result.rows[0]?.password_reset_token;
      expect(token).toBeDefined();

      const res = await request(context.httpServer)
        .post('/auth/reset-password')
        .send({ token, password: 'NewPass123!' })
        .expect(200);

      expect(res.body).toHaveProperty('message');
      await request(context.httpServer)
        .post('/auth/login')
        .send({ email: user.email, password: 'NewPass123!' })
        .expect(200);
    });

    it('should return 400 for an unknown reset token', async () => {
      const res = await request(context.httpServer)
        .post('/auth/reset-password')
        .send({ token: 'not-a-real-token', password: 'NewPass123!' })
        .expect(400);

      expect(res.body).toHaveProperty('message');
    });
  });
});
