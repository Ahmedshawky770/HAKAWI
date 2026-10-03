import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';

import { AuthController } from './auth.controller.ts';
import { AuthService } from './auth.service.ts';

type MockAuthService = {
  register: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  refreshTokens: ReturnType<typeof vi.fn>;
  session: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  forgotPassword: ReturnType<typeof vi.fn>;
  resetPassword: ReturnType<typeof vi.fn>;
  getAuthorizationUrl: ReturnType<typeof vi.fn>;
  handleOAuthCallback: ReturnType<typeof vi.fn>;
};

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

function readSetCookies(res: request.Response): readonly string[] {
  const raw: unknown = res.headers['set-cookie'];

  if (typeof raw === 'string') {
    return [raw];
  }
  if (Array.isArray(raw)) {
    return raw.filter((entry: unknown): entry is string => typeof entry === 'string');
  }
  return [];
}

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

describe('AuthController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let authService: MockAuthService;

  beforeAll(async () => {
    authService = {
      register: vi.fn(),
      login: vi.fn(),
      refreshTokens: vi.fn(),
      session: vi.fn(),
      logout: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      getAuthorizationUrl: vi.fn(),
      handleOAuthCallback: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET }),
        },
        // `@Secured` composes `RestrictionGuard`, which injects `ValkeyService` and the logger.
        // This module is hand-built rather than importing `CommonModule`, so both must be provided
        // here or Nest fails at DI resolution before any assertion runs.
        { provide: ValkeyService, useValue: { exists: vi.fn().mockResolvedValue(false), get: vi.fn(), set: vi.fn() } },
        {
          provide: WinstonLoggerService,
          useValue: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn(), verbose: vi.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => (key === 'jwt.secret' ? JWT_SECRET : undefined) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      vi.mocked(authService.register).mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          username: 'testuser',
          accountType: 'reader',
        },
        tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      });

      const res = await request(httpServer)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'SecurePass123!', name: 'Test User', username: 'testuser' })
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('tokens');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.user.email).toBe('test@example.com');
      expect(authService.register).toHaveBeenCalled();
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      vi.mocked(authService.login).mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          username: 'testuser',
          accountType: 'reader',
        },
        tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      });

      const res = await request(httpServer)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'SecurePass123!' })
        .expect(200);

      expect(res.body).toHaveProperty('tokens');
      expect(authService.login).toHaveBeenCalled();
    });
  });

  describe('POST /auth/refresh', () => {
    const payload = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        accountType: 'reader',
      },
      tokens: { accessToken: 'new-access-token', refreshToken: 'new-refresh-token' },
    };

    it('should refresh tokens', async () => {
      vi.mocked(authService.refreshTokens).mockResolvedValue(payload);

      const res = await request(httpServer).post('/auth/refresh').send({ refreshToken: 'refresh-token' }).expect(200);

      expect(res.body).toHaveProperty('tokens');
      expect(authService.refreshTokens).toHaveBeenCalled();
    });

    it('refreshes from the httpOnly cookie when the client sent no body token', async () => {
      vi.mocked(authService.refreshTokens).mockResolvedValue(payload);

      const res = await request(httpServer)
        .post('/auth/refresh')
        .set('Cookie', 'access_token=stale-access; refresh_token=refresh-from-cookie')
        .send({})
        .expect(200);

      expect(authService.refreshTokens).toHaveBeenCalledWith({ refreshToken: 'refresh-from-cookie' });
      expect(res.body).toHaveProperty('tokens.refreshToken', 'new-refresh-token');
    });

    it('still accepts a body-only refresh, so non-browser clients keep working', async () => {
      vi.mocked(authService.refreshTokens).mockResolvedValue(payload);

      await request(httpServer).post('/auth/refresh').send({ refreshToken: 'refresh-from-body' }).expect(200);

      expect(authService.refreshTokens).toHaveBeenCalledWith({ refreshToken: 'refresh-from-body' });
    });

    it('prefers the cookie and uses the body only as a fallback', async () => {
      vi.mocked(authService.refreshTokens).mockResolvedValue(payload);

      await request(httpServer)
        .post('/auth/refresh')
        .set('Cookie', 'refresh_token=refresh-from-cookie')
        .send({ refreshToken: 'refresh-from-body' })
        .expect(200);

      expect(authService.refreshTokens).toHaveBeenCalledWith({ refreshToken: 'refresh-from-cookie' });
    });

    it('falls through to the body when the browser sent a cookie it had already cleared', async () => {
      vi.mocked(authService.refreshTokens).mockResolvedValue(payload);

      await request(httpServer)
        .post('/auth/refresh')
        .set('Cookie', 'refresh_token=')
        .send({ refreshToken: 'refresh-from-body' })
        .expect(200);

      expect(authService.refreshTokens).toHaveBeenCalledWith({ refreshToken: 'refresh-from-body' });
    });

    it('rotates both cookies on a cookie-only refresh', async () => {
      vi.mocked(authService.refreshTokens).mockResolvedValue(payload);

      const res = await request(httpServer)
        .post('/auth/refresh')
        .set('Cookie', 'refresh_token=refresh-from-cookie')
        .send({})
        .expect(200);

      const cookies = readSetCookies(res).join(';');
      expect(cookies).toContain('access_token=new-access-token');
      expect(cookies).toContain('refresh_token=new-refresh-token');
    });

    it('refuses a refresh that carries neither a cookie nor a body token', async () => {
      vi.mocked(authService.refreshTokens).mockRejectedValue(new UnauthorizedException('Refresh token is required'));

      await request(httpServer).post('/auth/refresh').send({}).expect(401);

      expect(authService.refreshTokens).toHaveBeenCalledWith({ refreshToken: undefined });
    });

    it('refuses a refresh whose only source is a cleared cookie', async () => {
      vi.mocked(authService.refreshTokens).mockRejectedValue(new UnauthorizedException('Refresh token is required'));

      await request(httpServer)
        .post('/auth/refresh')
        .set('Cookie', 'access_token=; refresh_token=')
        .send({})
        .expect(401);

      expect(authService.refreshTokens).toHaveBeenCalledWith({ refreshToken: undefined });
    });

    it('clears the auth cookies when the refresh is rejected', async () => {
      vi.mocked(authService.refreshTokens).mockRejectedValue(new UnauthorizedException('Invalid refresh token'));

      const res = await request(httpServer)
        .post('/auth/refresh')
        .set('Cookie', 'refresh_token=expired-refresh-token')
        .send({})
        .expect(401);

      const cookies = readSetCookies(res).join(';');
      expect(cookies).toContain('access_token=;');
      expect(cookies).toContain('refresh_token=;');
    });

    it('keeps the cookies on a server fault, because the session is not what went wrong', async () => {
      vi.mocked(authService.refreshTokens).mockRejectedValue(new Error('valkey is down'));

      const res = await request(httpServer)
        .post('/auth/refresh')
        .set('Cookie', 'refresh_token=still-good-token')
        .send({})
        .expect(500);

      expect(readSetCookies(res)).toEqual([]);
    });
  });

  describe('GET /auth/session', () => {
    it('should return session with valid token', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(authService.session).mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          username: 'testuser',
          accountType: 'reader',
        },
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });

      const res = await request(httpServer).get('/auth/session').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body).toHaveProperty('user');
      expect(authService.session).toHaveBeenCalledWith('user-1');
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout', async () => {
      vi.mocked(authService.logout).mockResolvedValue({ message: 'Logged out successfully' });

      const res = await request(httpServer).post('/auth/logout').send({ refreshToken: 'refresh-token' }).expect(200);

      expect(res.body).toEqual({ message: 'Logged out successfully' });
      expect(authService.logout).toHaveBeenCalled();
    });

    it('revokes the refresh token held in the httpOnly cookie, not the body', async () => {
      vi.mocked(authService.logout).mockResolvedValue({ message: 'Logged out successfully' });

      await request(httpServer)
        .post('/auth/logout')
        .set('Cookie', 'access_token=access-from-cookie; refresh_token=refresh-from-cookie')
        .send({ refreshToken: 'refresh-from-body' })
        .expect(200);

      expect(authService.logout).toHaveBeenCalledWith('refresh-from-cookie');
    });

    it('falls back to the request body when the browser sent no cookie', async () => {
      vi.mocked(authService.logout).mockResolvedValue({ message: 'Logged out successfully' });

      await request(httpServer).post('/auth/logout').send({ refreshToken: 'refresh-from-body' }).expect(200);

      expect(authService.logout).toHaveBeenCalledWith('refresh-from-body');
    });

    it('falls back to the request body when the browser sent a cleared cookie', async () => {
      vi.mocked(authService.logout).mockResolvedValue({ message: 'Logged out successfully' });

      await request(httpServer)
        .post('/auth/logout')
        .set('Cookie', 'refresh_token=')
        .send({ refreshToken: 'refresh-from-body' })
        .expect(200);

      expect(authService.logout).toHaveBeenCalledWith('refresh-from-body');
    });

    it('succeeds and clears the cookies when the client holds no session at all', async () => {
      vi.mocked(authService.logout).mockResolvedValue({ message: 'Logged out successfully' });

      const res = await request(httpServer).post('/auth/logout').expect(200);

      expect(res.body).toEqual({ message: 'Logged out successfully' });
      expect(authService.logout).toHaveBeenCalledWith(undefined);
      expect(readSetCookies(res).join(';')).toContain('access_token=;');
      expect(readSetCookies(res).join(';')).toContain('refresh_token=;');
    });

    it('still clears the cookies when the refresh token is rejected', async () => {
      vi.mocked(authService.logout).mockRejectedValue(new UnauthorizedException('Invalid refresh token'));

      await request(httpServer).post('/auth/logout').set('Cookie', 'refresh_token=stale-refresh-token').expect(401);

      expect(authService.logout).toHaveBeenCalledWith('stale-refresh-token');
    });
  });

  describe('auth cookie contract', () => {
    const payload = {
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User', username: 'testuser', accountType: 'reader' },
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    };

    async function expectDocumentedCookies(res: request.Response): Promise<void> {
      const cookies = readSetCookies(res).join(';');

      expect(cookies).toContain('access_token=access-token');
      expect(cookies).toContain('refresh_token=refresh-token');
      expect(cookies).toContain('HttpOnly');
      expect(cookies).toContain('SameSite=Strict');
      expect(cookies).toContain('Path=/');
      expect(cookies).not.toContain('SameSite=Lax');
    }

    it('sets the documented cookies when a user registers', async () => {
      vi.mocked(authService.register).mockResolvedValue(payload);

      const res = await request(httpServer)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'SecurePass123!', name: 'Test User', username: 'testuser' })
        .expect(201);

      await expectDocumentedCookies(res);
    });

    it('sets the documented cookies when a user logs in', async () => {
      vi.mocked(authService.login).mockResolvedValue(payload);

      const res = await request(httpServer)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'SecurePass123!' })
        .expect(200);

      await expectDocumentedCookies(res);
    });

    it('sets the documented cookies when a session is refreshed', async () => {
      vi.mocked(authService.refreshTokens).mockResolvedValue(payload);

      const res = await request(httpServer).post('/auth/refresh').send({ refreshToken: 'refresh-token' }).expect(200);

      await expectDocumentedCookies(res);
    });

    it('sets the documented cookies on the OAuth callback redirect', async () => {
      vi.mocked(authService.handleOAuthCallback).mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const res = await request(httpServer).get('/auth/oauth/google/callback?code=abc&state=xyz').expect(302);

      await expectDocumentedCookies(res);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should request password reset', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue(undefined);

      const res = await request(httpServer)
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(res.body).toEqual({ message: 'If the email exists, a reset link has been sent' });
      expect(authService.forgotPassword).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should reset password', async () => {
      vi.mocked(authService.resetPassword).mockResolvedValue(undefined);

      const res = await request(httpServer)
        .post('/auth/reset-password')
        .send({ token: 'reset-token', password: 'NewPass123!' })
        .expect(200);

      expect(res.body).toEqual({ message: 'Password reset successfully' });
      expect(authService.resetPassword).toHaveBeenCalled();
    });
  });
});
