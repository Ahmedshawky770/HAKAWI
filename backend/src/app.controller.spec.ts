import type { Server } from 'http';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Module, ServiceUnavailableException } from '@nestjs/common';
import request from 'supertest';

import {
  AppController,
  type ApiIndexResponse,
  type HealthResponse,
  type ReadinessFailureBody,
  type ReadinessSuccessBody,
} from './app.controller.ts';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.ts';
import { ValkeyService } from './common/services/valkey.service.ts';
import { WinstonLoggerService } from './common/services/winston-logger.service.ts';
import { checkDatabaseHealth } from './db/router.ts';

vi.mock('./db/router.ts', () => ({
  checkDatabaseHealth: vi.fn(),
}));

type MockValkeyService = { ping: ReturnType<typeof vi.fn> };

const mockValkeyService: MockValkeyService = {
  ping: vi.fn().mockResolvedValue('PONG'),
};

// Mock replicas matching the `checkDatabaseHealth` return shape
// (see `backend/src/db/router.ts`).
const healthyReplica = {
  host: 'replica-1',
  port: 5432,
  healthy: true,
  lagMs: null,
  usable: true,
};
const unhealthyReplica = {
  host: 'replica-1',
  port: 5432,
  healthy: false,
  lagMs: null,
  usable: false,
};

@Module({
  controllers: [AppController],
  providers: [
    { provide: ValkeyService, useValue: mockValkeyService },
    // A stub rather than the real Winston logger: the filter writes one error line per failing
    // readiness probe, and a logger that writes to the console and to disk would bury the assertions
    // in a test report. What the filter needs from it is the write path, not the destination.
    {
      provide: WinstonLoggerService,
      useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn(), verbose: vi.fn() },
    },
  ],
})
class TestModule {}

describe('AppController', () => {
  let appController: AppController;
  let app: INestApplication;
  let httpServer: Server;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    appController = moduleRef.get<AppController>(AppController);
    mockValkeyService.ping.mockResolvedValue('PONG');
    vi.mocked(checkDatabaseHealth).mockResolvedValue({
      primary: true,
      replicas: [healthyReplica, healthyReplica],
    });

    app = moduleRef.createNestApplication();
    // The readiness route's 503 is asserted with the REAL global exception filter registered, because
    // that filter rebuilds every error body into the application envelope and passes through exactly
    // `error`, `message`, `details`, `statusCode`, `timestamp` and `path`. Without it a test would
    // assert a body the route never actually sends — a payload the filter discards — and the readiness
    // contract would appear satisfied while a probe received `{"message":"Internal server error"}`.
    app.useGlobalFilters(new AllExceptionsFilter(moduleRef.get<WinstonLoggerService>(WinstonLoggerService)));
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    await moduleRef.close();
    vi.restoreAllMocks();
  });

  describe('root', () => {
    // This was `"Hello World!"`, the Nest scaffold's default, at the exact path a probe and a new
    // developer's first `curl` both hit. The tests below assert what replaced it, so the route cannot
    // silently regress to a greeting that tells a reader nothing.
    it('should serve the service index over HTTP', async () => {
      const res = await request(httpServer).get('/').expect(200);

      expect(res.body).toMatchObject({
        name: 'Hakawi API',
        version: '1.0.0',
        prefix: 'api/v1',
      });
      expect((res.body as ApiIndexResponse).documentation).toContain('api/docs');
    });

    it('should embed the health report so one round trip answers everything', async () => {
      const res = await request(httpServer).get('/').expect(200);

      expect((res.body as ApiIndexResponse).health).toMatchObject({ status: 'healthy' });
    });

    it('should report degraded inline while still answering 200', async () => {
      // Deliberate: an index that 500s when the database is unreachable is useless to the probe that
      // most needs it. The degradation is in the body, not the status code.
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        primary: false,
        replicas: [unhealthyReplica, unhealthyReplica],
      });

      const res = await request(httpServer).get('/').expect(200);

      expect((res.body as ApiIndexResponse).health).toMatchObject({ status: 'degraded', database: 'disconnected' });
    });

    it('should require no authentication', async () => {
      await request(httpServer).get('/').expect(200);
    });

    it('should not expose a getHello method any more', () => {
      // `AppService`, whose only method was `getHello`, is deleted. Asserting its absence stops it
      // being reintroduced as a "temporary" helper.
      expect((appController as unknown as Record<string, unknown>).getHello).toBeUndefined();
    });
  });

  describe('GET /health', () => {
    it('should report healthy when both dependencies answer', async () => {
      const res = await request(httpServer).get('/health').expect(200);

      expect(res.body).toEqual({
        status: 'healthy',
        database: 'connected',
        replicas: [healthyReplica, healthyReplica],
        valkey: 'connected',
        timestamp: (res.body as HealthResponse).timestamp,
      });
      expect((res.body as HealthResponse).timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should probe the database via checkDatabaseHealth', async () => {
      await appController.getHealth();
      expect(checkDatabaseHealth).toHaveBeenCalledTimes(1);
    });

    it('should probe valkey with a ping', async () => {
      await appController.getHealth();
      expect(mockValkeyService.ping).toHaveBeenCalledTimes(1);
    });

    it('should degrade when the database primary is unreachable', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        primary: false,
        replicas: [healthyReplica, healthyReplica],
      });

      const res = await request(httpServer).get('/health').expect(200);

      expect(res.body).toMatchObject({
        status: 'degraded',
        database: 'disconnected',
        replicas: [healthyReplica, healthyReplica],
        valkey: 'connected',
      });
    });

    it('should degrade when valkey is unreachable', async () => {
      mockValkeyService.ping.mockRejectedValue(new Error('connection reset'));

      const res = await request(httpServer).get('/health').expect(200);

      expect(res.body).toMatchObject({
        status: 'degraded',
        database: 'connected',
        replicas: [healthyReplica, healthyReplica],
        valkey: 'disconnected',
      });
    });

    it('should degrade when both dependencies are unreachable', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        primary: false,
        replicas: [unhealthyReplica, unhealthyReplica],
      });
      mockValkeyService.ping.mockRejectedValue(new Error('connection reset'));

      const res = await request(httpServer).get('/health').expect(200);

      expect(res.body).toMatchObject({
        status: 'degraded',
        database: 'disconnected',
        replicas: [unhealthyReplica, unhealthyReplica],
        valkey: 'disconnected',
      });
    });

    it('should still return an ISO timestamp when degraded', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        primary: false,
        replicas: [unhealthyReplica, unhealthyReplica],
      });

      const res = await request(httpServer).get('/health').expect(200);

      expect(new Date((res.body as HealthResponse).timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  /**
   * THE READINESS PROBE, AND WHY IT IS A SEPARATE ROUTE.
   *
   * Everything above stays 200 when a dependency is down, on purpose — an index that 500s when the
   * database is unreachable is useless to the thing that most needs it. A Kubernetes `httpGet` probe
   * only fails on a non-2xx, so it could never use that route. `GET /health/ready` is the route that
   * note above `ApiIndexResponse` called for, and every test below asserts the 503 that `GET /health`
   * deliberately does not produce.
   */
  /**
   * THE READINESS PROBE, AND WHY IT IS A SEPARATE ROUTE.
   *
   * Everything above stays 200 when a dependency is down, on purpose — an index that 500s when the
   * database is unreachable is useless to the thing that most needs it. A Kubernetes `httpGet` probe
   * only fails on a non-2xx, so it could never use that route. `GET /health/ready` is the route that
   * note above `ApiIndexResponse` called for, and every test below asserts the 503 that `GET /health`
   * deliberately does not produce.
   *
   * The 503 body is the application's standard error envelope, because the global `AllExceptionsFilter`
   * rebuilds every error body into it and passes through exactly `error`, `message`, `details`,
   * `statusCode`, `timestamp` and `path`. What is asserted is that the dependency NAME survives that
   * rebuild: the payload is shaped around the filter rather than fought (see `getReadiness`), and a
   * test that asserted the raw exception payload would be asserting a body a probe never receives.
   */
  describe('GET /health/ready', () => {
    it('should answer 200 when both dependencies answer', async () => {
      const res = await request(httpServer).get('/health/ready').expect(200);

      expect((res.body as ReadinessSuccessBody).status).toBe('ready');
      expect((res.body as ReadinessSuccessBody).timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should require no authentication, because a probe carries no token', async () => {
      await request(httpServer).get('/health/ready').expect(200);
    });

    it('should answer 503 and name postgres when the primary is unreachable', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({ primary: false, replicas: [healthyReplica, healthyReplica] });

      const res = await request(httpServer).get('/health/ready').expect(503);
      const body = res.body as ReadinessFailureBody;

      expect(body.error).toBe('NOT_READY');
      expect(body.details).toEqual([{ dependency: 'postgres' }]);
      expect(body.message).toBe('Service is not ready: postgres');
    });

    it('should answer 503 and name valkey when the ping fails', async () => {
      mockValkeyService.ping.mockRejectedValue(new Error('connection reset'));

      const res = await request(httpServer).get('/health/ready').expect(503);
      const body = res.body as ReadinessFailureBody;

      expect(body.details).toEqual([{ dependency: 'valkey' }]);
      expect(body.message).toBe('Service is not ready: valkey');
    });

    it('should name both dependencies when both are unreachable', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({ primary: false, replicas: [unhealthyReplica, unhealthyReplica] });
      mockValkeyService.ping.mockRejectedValue(new Error('connection reset'));

      const res = await request(httpServer).get('/health/ready').expect(503);

      expect((res.body as ReadinessFailureBody).details).toEqual([
        { dependency: 'postgres' },
        { dependency: 'valkey' },
      ]);
    });

    it('should answer 503 even when a replica is down but the primary is up', async () => {
      // Readiness is a property of the primary and the cache, not of the read replicas. This is the
      // case `GET /health` answers `degraded` for and that must not become a 503.
      vi.mocked(checkDatabaseHealth).mockResolvedValue({ primary: true, replicas: [unhealthyReplica] });

      await request(httpServer).get('/health/ready').expect(200);
    });

    it('should not change GET /health, which stays 200 on a dead database', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({ primary: false, replicas: [unhealthyReplica, unhealthyReplica] });

      await request(httpServer).get('/health').expect(200);
    });

    /**
     * The payload the exception carries, asserted directly on the controller rather than through HTTP.
     *
     * WHY THIS IS NOT REDUNDANT WITH THE TESTS ABOVE. Those assert what the FILTER leaves behind; this
     * asserts what the controller chose to say, which is the part that can silently lose a dependency
     * name if the envelope mapping is ever changed. The two together pin the whole path:
     * controller -> exception -> filter -> response.
     */
    it('should throw a ServiceUnavailableException carrying every failing dependency', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({ primary: false, replicas: [healthyReplica] });
      mockValkeyService.ping.mockRejectedValue(new Error('connection reset'));

      const error = await appController
        .getReadiness()
        .then(() => undefined)
        .catch((caught: unknown) => caught as ServiceUnavailableException);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error?.getStatus()).toBe(503);
      expect(error?.getResponse()).toEqual({
        error: 'NOT_READY',
        message: 'Service is not ready: postgres, valkey',
        details: [{ dependency: 'postgres' }, { dependency: 'valkey' }],
      });
    });
  });


  /**
   * The production path.
   *
   * `main.ts` calls `app.setGlobalPrefix('api/v1')`, so the route a probe is pointed at is
   * `/api/v1/health/ready` and not `/health/ready`. This is the end-to-end assertion that the route
   * name the controller declares produces the URL the contract specifies.
   */
  describe('under the global api/v1 prefix', () => {
    let prefixedApp: INestApplication;
    let prefixedServer: Server;

    beforeEach(async () => {
      prefixedApp = (await Test.createTestingModule({ imports: [TestModule] }).compile()).createNestApplication();
      prefixedApp.setGlobalPrefix('api/v1');
      await prefixedApp.init();
      prefixedServer = prefixedApp.getHttpServer() as Server;
    });

    afterEach(async () => {
      if (prefixedApp) {
        await prefixedApp.close();
      }
    });

    it('serves GET /api/v1/health/ready with 200 when both dependencies answer', async () => {
      await request(prefixedServer).get('/api/v1/health/ready').expect(200);
    });

    it('serves GET /api/v1/health/ready with 503 when the primary is unreachable', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({ primary: false, replicas: [healthyReplica] });

      const res = await request(prefixedServer).get('/api/v1/health/ready').expect(503);

      expect((res.body as ReadinessFailureBody).details).toEqual([{ dependency: 'postgres' }]);
    });

    it('keeps GET /api/v1/health answering 200 on the same dead database', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({ primary: false, replicas: [unhealthyReplica] });

      // Two routes, one dependency state, two answers — and that is the whole reason the second one
      // exists. A probe needs a binary; an operator needs the description.
      await request(prefixedServer).get('/api/v1/health').expect(200);
      await request(prefixedServer).get('/api/v1/health/ready').expect(503);
    });
  });
});
