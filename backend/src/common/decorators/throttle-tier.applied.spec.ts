import type { Server } from 'http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard, getOptionsToken, getStorageToken } from '@nestjs/throttler';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';

import { buildThrottleConfig, THROTTLE_TIERS, type ThrottleTier } from '../../config/throttle.config.ts';
import { ValkeyService } from '../services/valkey.service.ts';
import { ValkeyThrottlerStorage } from '../throttler/valkey-throttler.storage.ts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.ts';
import { AuthController } from '../../modules/auth/auth.controller.ts';
import { AuthService } from '../../modules/auth/auth.service.ts';
import { UploadController } from '../../modules/upload/upload.controller.ts';
import { UploadService } from '../../modules/upload/upload.service.ts';
import { SearchController } from '../../modules/search/search.controller.ts';
import { SearchService } from '../../modules/search/search.service.ts';

const UNREACHABLE_VALKEY: ValkeyService = {
  ping: () => Promise.reject(new Error('Valkey client not initialized')),
} as unknown as ValkeyService;

function throttlerOptions(): ThrottlerModuleOptions {
  const { tiers } = buildThrottleConfig({});
  return {
    throttlers: Object.values(tiers).map((tier: ThrottleTier) => ({
      name: tier.name,
      limit: tier.limit,
      ttl: tier.ttlMs,
      blockDuration: tier.blockDurationMs,
      getTracker: (incoming: Record<string, unknown>): string =>
        typeof incoming.ip === 'string' ? `ip:${incoming.ip}` : 'ip:unknown',
      setHeaders: true,
    })),
  };
}

describe('throttle tiers applied to the real controllers', () => {
  let app: INestApplication;
  let httpServer: Server;
  let authService: { login: ReturnType<typeof vi.fn> };
  let uploadService: { generatePresignedUrl: ReturnType<typeof vi.fn> };
  let searchService: { search: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = { login: vi.fn() };
    uploadService = { generatePresignedUrl: vi.fn() };
    searchService = { search: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(throttlerOptions())],
      controllers: [AuthController, UploadController, SearchController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UploadService, useValue: uploadService },
        { provide: SearchService, useValue: searchService },
        JwtAuthGuard,
        { provide: JwtService, useValue: new JwtService({ secret: 'throttle-tier-spec-secret' }) },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => (key === 'jwt.secret' ? 'throttle-tier-spec-secret' : undefined) },
        },
        {
          provide: getStorageToken(),
          useFactory: (): ThrottlerStorage => new ValkeyThrottlerStorage(UNREACHABLE_VALKEY),
        },
        {
          provide: 'APP_GUARD',
          useFactory: (options: ThrottlerModuleOptions, storage: ThrottlerStorage): ThrottlerGuard =>
            new ThrottlerGuard(options, storage, new Reflector()),
          inject: [getOptionsToken(), getStorageToken()],
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Server;

    authService.login.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User', username: 'testuser', accountType: 'reader' },
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    });
    uploadService.generatePresignedUrl.mockResolvedValue({
      filename: 'images/test.png',
      originalName: 'test.png',
      mimetype: 'image/png',
      size: 0,
      url: 'https://s3.amazonaws.com/bucket/images/test.png',
    });
    searchService.search.mockResolvedValue({ results: [], total: 0, page: 1, limit: 20, query: 'x', took: 1 });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('answers 429 for POST /auth/login on the eleventh request in the window', async () => {
    for (let attempt = 0; attempt < THROTTLE_TIERS.auth.limit; attempt += 1) {
      await request(httpServer)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'SecurePass123!' })
        .expect(200);
    }
    expect(authService.login).toHaveBeenCalledTimes(THROTTLE_TIERS.auth.limit);

    const blocked = await request(httpServer)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'SecurePass123!' })
      .expect(429);

    expect(authService.login).toHaveBeenCalledTimes(THROTTLE_TIERS.auth.limit);
    expect(blocked.body.message).toContain('ThrottlerException');
  });

  it('advertises the auth tier limit and the retry window on an allowed login', async () => {
    const allowed = await request(httpServer)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'SecurePass123!' })
      .expect(200);

    expect(allowed.headers['x-ratelimit-limit-auth']).toBe(String(THROTTLE_TIERS.auth.limit));
    expect(allowed.headers['x-ratelimit-remaining-auth']).toBe(String(THROTTLE_TIERS.auth.limit - 1));
    expect(Number(allowed.headers['x-ratelimit-reset-auth'])).toBeGreaterThan(0);
  });

  it('sets Retry-After-auth once the login tier blocks a request', async () => {
    for (let attempt = 0; attempt <= THROTTLE_TIERS.auth.limit; attempt += 1) {
      await request(httpServer).post('/auth/login').send({ email: 'test@example.com', password: 'SecurePass123!' });
    }

    const blocked = await request(httpServer)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'SecurePass123!' })
      .expect(429);

    expect(Number(blocked.headers['retry-after-auth'])).toBeGreaterThan(0);
  });

  it('answers 429 for POST /upload/image on the sixth request in the window', async () => {
    for (let attempt = 0; attempt < THROTTLE_TIERS.upload.limit; attempt += 1) {
      const allowed = await request(httpServer)
        .post('/upload/image')
        .send({ filename: 'test.png', contentType: 'image/png' })
        .expect(201);

      expect(allowed.headers['x-ratelimit-limit-upload']).toBe(String(THROTTLE_TIERS.upload.limit));
      expect(Number(allowed.headers['x-ratelimit-reset-upload'])).toBeGreaterThan(0);
    }
    expect(uploadService.generatePresignedUrl).toHaveBeenCalledTimes(THROTTLE_TIERS.upload.limit);

    await request(httpServer)
      .post('/upload/image')
      .send({ filename: 'test.png', contentType: 'image/png' })
      .expect(429);

    expect(uploadService.generatePresignedUrl).toHaveBeenCalledTimes(THROTTLE_TIERS.upload.limit);
  });

  it('answers 429 for GET /search on the fifty-first request in the window', async () => {
    for (let attempt = 0; attempt < THROTTLE_TIERS.search.limit; attempt += 1) {
      const allowed = await request(httpServer).get('/search?q=x').expect(200);

      expect(allowed.headers['x-ratelimit-limit-search']).toBe(String(THROTTLE_TIERS.search.limit));
      expect(Number(allowed.headers['x-ratelimit-reset-search'])).toBeGreaterThan(0);
    }
    expect(searchService.search).toHaveBeenCalledTimes(THROTTLE_TIERS.search.limit);

    await request(httpServer).get('/search?q=x').expect(429);

    expect(searchService.search).toHaveBeenCalledTimes(THROTTLE_TIERS.search.limit);
  });

  it('counts each controller against its own tier rather than the shared default tier', async () => {
    const allowed = await request(httpServer).get('/search?q=x').expect(200);

    expect(allowed.headers['x-ratelimit-limit-search']).toBe('50');
    expect(allowed.headers['x-ratelimit-limit']).toBeUndefined();
    expect(allowed.headers['x-ratelimit-limit-auth']).toBeUndefined();
    expect(allowed.headers['x-ratelimit-limit-upload']).toBeUndefined();
  });

  it('does not let the auth budget be spent on upload or search traffic', async () => {
    for (let attempt = 0; attempt < THROTTLE_TIERS.upload.limit; attempt += 1) {
      await request(httpServer).post('/upload/image').send({ filename: 'test.png' });
    }

    await request(httpServer).get('/search?q=x').expect(200);
    await request(httpServer)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'SecurePass123!' })
      .expect(200);
  });
});
