import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User', username: 'testuser', accountType: 'reader' },
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
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User', username: 'testuser', accountType: 'reader' },
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
    it('should refresh tokens', async () => {
      vi.mocked(authService.refreshTokens).mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User', username: 'testuser', accountType: 'reader' },
        tokens: { accessToken: 'new-access-token', refreshToken: 'new-refresh-token' },
      });

      const res = await request(httpServer)
        .post('/auth/refresh')
        .send({ refreshToken: 'refresh-token' })
        .expect(200);

      expect(res.body).toHaveProperty('tokens');
      expect(authService.refreshTokens).toHaveBeenCalled();
    });
  });

  describe('GET /auth/session', () => {
    it('should return session with valid token', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(authService.session).mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User', username: 'testuser', accountType: 'reader' },
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });

      const res = await request(httpServer)
        .get('/auth/session')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('user');
      expect(authService.session).toHaveBeenCalledWith('user-1');
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout', async () => {
      vi.mocked(authService.logout).mockResolvedValue({ message: 'Logged out successfully' });

      const res = await request(httpServer)
        .post('/auth/logout')
        .send({ refreshToken: 'refresh-token' })
        .expect(200);

      expect(res.body).toEqual({ message: 'Logged out successfully' });
      expect(authService.logout).toHaveBeenCalled();
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
