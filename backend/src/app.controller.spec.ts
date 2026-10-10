import type { Server } from 'http';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Module } from '@nestjs/common';
import request from 'supertest';

import { AppController } from './app.controller.ts';
import { ValkeyService } from './common/services/valkey.service.ts';
import { checkDatabaseHealth } from './db/router.ts';

vi.mock('./db/router.ts', () => ({
  checkDatabaseHealth: vi.fn(),
}));

type MockValkeyService = { ping: ReturnType<typeof vi.fn> };

const mockValkeyService: MockValkeyService = {
  ping: vi.fn().mockResolvedValue('PONG'),
};

@Module({
  controllers: [AppController],
  providers: [{ provide: ValkeyService, useValue: mockValkeyService }],
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
      replicas: [true, true],
    });

    app = moduleRef.createNestApplication();
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
        documentation: expect.stringContaining('api/docs'),
      });
    });

    it('should embed the health report so one round trip answers everything', async () => {
      const res = await request(httpServer).get('/').expect(200);

      expect(res.body.health).toMatchObject({ status: 'healthy' });
    });

    it('should report degraded inline while still answering 200', async () => {
      // Deliberate: an index that 500s when the database is unreachable is useless to the probe that
      // most needs it. The degradation is in the body, not the status code.
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        primary: false,
        replicas: [false, false],
      });

      const res = await request(httpServer).get('/').expect(200);

      expect(res.body.health).toMatchObject({ status: 'degraded', database: 'disconnected' });
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
        replicas: ['connected', 'connected'],
        valkey: 'connected',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
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
        replicas: [true, true],
      });

      const res = await request(httpServer).get('/health').expect(200);

      expect(res.body).toMatchObject({
        status: 'degraded',
        database: 'disconnected',
        replicas: ['connected', 'connected'],
        valkey: 'connected',
      });
    });

    it('should degrade when valkey is unreachable', async () => {
      mockValkeyService.ping.mockRejectedValue(new Error('connection reset'));

      const res = await request(httpServer).get('/health').expect(200);

      expect(res.body).toMatchObject({
        status: 'degraded',
        database: 'connected',
        replicas: ['connected', 'connected'],
        valkey: 'disconnected',
      });
    });

    it('should degrade when both dependencies are unreachable', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        primary: false,
        replicas: [false, false],
      });
      mockValkeyService.ping.mockRejectedValue(new Error('connection reset'));

      const res = await request(httpServer).get('/health').expect(200);

      expect(res.body).toMatchObject({
        status: 'degraded',
        database: 'disconnected',
        replicas: ['disconnected', 'disconnected'],
        valkey: 'disconnected',
      });
    });

    it('should still return an ISO timestamp when degraded', async () => {
      vi.mocked(checkDatabaseHealth).mockResolvedValue({
        primary: false,
        replicas: [false, false],
      });

      const res = await request(httpServer).get('/health').expect(200);

      expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
    });
  });
});
