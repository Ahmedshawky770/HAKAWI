import type { Server } from 'http';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getStorageToken } from '@nestjs/throttler';
import request from 'supertest';

import { AdminRole, AccountType } from '../constants/roles.ts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.ts';
import { RolesGuard } from '../guards/roles.guard.ts';
import { CacheMetrics } from '../interceptors/cache.interceptor.ts';
import { IpBlocklistService } from '../waf/ip-blocklist.service.ts';
import { ValkeyService } from '../services/valkey.service.ts';
import { ValkeyThrottlerStorage } from '../throttler/valkey-throttler.storage.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import type { JwtPayload } from '../utils/jwt.util.ts';

import { CacheMetricsController } from './metrics.controller.ts';

const SECRET = 'metrics-controller-spec-secret-0123456789';
const UNREACHABLE_VALKEY: ValkeyService = {
  ping: () => Promise.reject(new Error('Valkey client not initialized')),
} as unknown as ValkeyService;

function tokenFor(payload: JwtPayload): string {
  return new JwtService({ secret: SECRET }).sign(payload);
}

/**
 * `supertest` types `response.body` as `any`. Every assertion below reads a field off
 * it, so the body is narrowed once here instead of casting at every call site: the two
 * shapes are the only two the controller can produce.
 */
interface ErrorBody {
  readonly message?: string;
}
interface CacheBody {
  readonly component?: string;
  readonly hits?: number;
  readonly misses?: number;
  readonly hitRate?: number;
}
interface DegradationBody {
  readonly component?: string;
  readonly rateLimiter?: {
    readonly storage?: string;
    readonly probed?: boolean;
    readonly degradation?: { readonly degraded?: boolean; readonly degradationCount?: number };
  };
  readonly wafBlocklist?: { readonly available?: boolean | null; readonly consecutiveFailures?: number };
}

function bodyAs<T>(response: { body: unknown }): T {
  return response.body as T;
}

function getAs<T>(server: Server, path: string, token: string): Promise<{ body: T }> {
  return request(server)
    .get(path)
    .set('Authorization', `Bearer ${token}`)
    .then((response) => ({ body: bodyAs<T>(response) }));
}

describe('CacheMetricsController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let jwt: JwtService;

  const superAdminToken = (): string =>
    tokenFor({
      sub: 'admin-1',
      email: 'admin@example.com',
      accountType: AccountType.ADMIN,
      adminRole: AdminRole.SUPER_ADMIN,
    });

  const contentModeratorToken = (): string =>
    tokenFor({
      sub: 'mod-1',
      email: 'mod@example.com',
      accountType: AccountType.ADMIN,
      adminRole: AdminRole.CONTENT_MODERATOR,
    });

  const readerToken = (): string =>
    tokenFor({ sub: 'reader-1', email: 'reader@example.com', accountType: AccountType.READER });

  beforeEach(async () => {
    jwt = new JwtService({ secret: SECRET });
    const moduleRef = await Test.createTestingModule({
      controllers: [CacheMetricsController],
      providers: [
        CacheMetrics,
        JwtAuthGuard,
        RolesGuard,
        IpBlocklistService,
        WinstonLoggerService,
        { provide: Reflector, useValue: new Reflector() },
        { provide: JwtService, useValue: jwt },
        { provide: ValkeyService, useValue: UNREACHABLE_VALKEY },
        // Registered with an explicit factory, exactly as `CommonModule` does: the
        // storage's second constructor argument is an options object, not an injectable.
        {
          provide: ValkeyThrottlerStorage,
          useFactory: (valkey: ValkeyService, logger: WinstonLoggerService): ValkeyThrottlerStorage =>
            new ValkeyThrottlerStorage(valkey, { logger }),
          inject: [ValkeyService, WinstonLoggerService],
        },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => (key === 'jwt.secret' ? SECRET : undefined) },
        },
        {
          provide: getStorageToken(),
          useFactory: (storage: ValkeyThrottlerStorage): ValkeyThrottlerStorage => storage,
          inject: [ValkeyThrottlerStorage],
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('fails closed for an unauthenticated caller', () => {
    // The endpoint used to be registered on the raw Express adapter AFTER the WAF
    // middleware, so it sat outside `JwtAuthGuard`, `RolesGuard`, the global validation
    // pipe and the global exception filter, and answered any anonymous GET with the
    // cache counters.
    it.each([['/api/v1/metrics/cache'], ['/api/v1/metrics/degradation']])(
      'rejects GET %s with 401 when no token is presented',
      async (path) => {
        const response = await request(httpServer).get(path).expect(401);

        expect(bodyAs<Record<string, unknown>>(response)).not.toHaveProperty('hits');
        expect(bodyAs<Record<string, unknown>>(response)).not.toHaveProperty('component');
      },
    );

    it.each([['/api/v1/metrics/cache'], ['/api/v1/metrics/degradation']])(
      'rejects GET %s with 401 when the token is invalid',
      async (path) => {
        const response = await request(httpServer).get(path).set('Authorization', 'Bearer not-a-jwt').expect(401);

        expect(bodyAs<Record<string, unknown>>(response)).not.toHaveProperty('hits');
      },
    );

    it('rejects a token signed with the wrong secret', async () => {
      const forged = tokenFor({
        sub: 'admin-1',
        email: 'a@example.com',
        accountType: AccountType.ADMIN,
        adminRole: AdminRole.SUPER_ADMIN,
      });

      await request(httpServer)
        .get('/api/v1/metrics/cache')
        .set('Authorization', `Bearer ${forged.slice(0, -2)}xx`)
        .expect(401);
    });
  });

  describe('rejects a caller that is not a super admin', () => {
    it('refuses a reader', async () => {
      await request(httpServer)
        .get('/api/v1/metrics/cache')
        .set('Authorization', `Bearer ${readerToken()}`)
        .expect(403);
    });

    it('refuses a non-super-admin officer', async () => {
      const response = await request(httpServer)
        .get('/api/v1/metrics/cache')
        .set('Authorization', `Bearer ${contentModeratorToken()}`)
        .expect(403);

      expect(bodyAs<ErrorBody>(response).message).toBe('Insufficient admin privileges');
    });

    it('refuses a non-super-admin officer on the degradation endpoint too', async () => {
      await request(httpServer)
        .get('/api/v1/metrics/degradation')
        .set('Authorization', `Bearer ${contentModeratorToken()}`)
        .expect(403);
    });
  });

  describe('allows a super admin', () => {
    it('serves the cache counters', async () => {
      const { body } = await getAs<CacheBody>(httpServer, '/api/v1/metrics/cache', superAdminToken());

      expect(body).toMatchObject({ component: 'CacheMetrics', hits: 0, misses: 0, hitRate: 0 });
    });

    it('serves the degradation report so an outage is scrapeable', async () => {
      const { body } = await getAs<DegradationBody>(httpServer, '/api/v1/metrics/degradation', superAdminToken());

      expect(body.component).toBe('SecurityDegradation');
      expect(['valkey', 'in-memory-fallback']).toContain(body.rateLimiter?.storage);
      expect(typeof body.rateLimiter?.probed).toBe('boolean');
      expect(typeof body.rateLimiter?.degradation?.degraded).toBe('boolean');
      expect(typeof body.wafBlocklist?.consecutiveFailures).toBe('number');
    });

    it('reports the rate limiter as degraded while Valkey is unreachable', async () => {
      const storage = app.get(ValkeyThrottlerStorage);
      // One counted request is enough to force the probe and open the episode.
      await storage.increment('probe', 60_000, 100, 0, 'default');

      const { body } = await getAs<DegradationBody>(httpServer, '/api/v1/metrics/degradation', superAdminToken());

      expect(body.rateLimiter?.storage).toBe('in-memory-fallback');
      expect(body.rateLimiter?.probed).toBe(true);
      expect(body.rateLimiter?.degradation?.degraded).toBe(true);
      expect(body.rateLimiter?.degradation?.degradationCount).toBeGreaterThan(0);
    });

    it('says "not exercised yet" rather than "broken" before the first probe', async () => {
      const { body } = await getAs<DegradationBody>(httpServer, '/api/v1/metrics/degradation', superAdminToken());

      expect(body.rateLimiter?.probed).toBe(false);
      expect(body.rateLimiter?.degradation?.degradationCount).toBe(0);
      expect(body.wafBlocklist?.available).toBeNull();
    });
  });

  it('serves under the same global prefix as every other route', async () => {
    // The raw-adapter registration hardcoded the prefix in its path; as a controller it
    // inherits `api/v1`, so a prefix change moves this endpoint with everything else.
    await request(httpServer).get('/metrics/cache').set('Authorization', `Bearer ${superAdminToken()}`).expect(404);
  });

  it('never reaches the handler for an unauthenticated caller', async () => {
    const snapshot = vi.spyOn(CacheMetrics.prototype, 'snapshot');

    await request(httpServer).get('/api/v1/metrics/cache').expect(401);

    expect(snapshot).not.toHaveBeenCalled();
  });
});
