import type { Server } from 'http';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Module } from '@nestjs/common';
import request from 'supertest';

import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { ValkeyService } from './common/services/valkey.service.ts';
import { db } from './db/index.ts';

vi.mock('./db/index.ts', () => ({
  db: { execute: vi.fn() },
}));

type MockValkeyService = { ping: ReturnType<typeof vi.fn> };

const mockValkeyService: MockValkeyService = {
  ping: vi.fn().mockResolvedValue('PONG'),
};

@Module({
  controllers: [AppController],
  providers: [AppService, { provide: ValkeyService, useValue: mockValkeyService }],
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
    vi.mocked(db.execute).mockResolvedValue([] as never);

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
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });

    it('should serve the root route over HTTP', async () => {
      const res = await request(httpServer).get('/').expect(200);
      expect(res.text).toBe('Hello World!');
    });
  });

  describe('GET /health', () => {
    it('should report healthy when both dependencies answer', async () => {
      const res = await request(httpServer).get('/health').expect(200);

      expect(res.body).toEqual({
        status: 'healthy',
        database: 'connected',
        valkey: 'connected',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('should probe the database with a trivial statement', async () => {
      await appController.getHealth();
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('should probe valkey with a ping', async () => {
      await appController.getHealth();
      expect(mockValkeyService.ping).toHaveBeenCalledTimes(1);
    });

    it('should degrade when the database is unreachable', async () => {
      vi.mocked(db.execute).mockRejectedValue(new Error('connection refused'));

      const res = await request(httpServer).get('/health').expect(200);

      expect(res.body).toMatchObject({
        status: 'degraded',
        database: 'disconnected',
        valkey: 'connected',
      });
    });

    it('should degrade when valkey is unreachable', async () => {
      mockValkeyService.ping.mockRejectedValue(new Error('connection reset'));

      const res = await request(httpServer).get('/health').expect(200);

      expect(res.body).toMatchObject({
        status: 'degraded',
        database: 'connected',
        valkey: 'disconnected',
      });
    });

    it('should degrade when both dependencies are unreachable', async () => {
      vi.mocked(db.execute).mockRejectedValue(new Error('connection refused'));
      mockValkeyService.ping.mockRejectedValue(new Error('connection reset'));

      const res = await request(httpServer).get('/health').expect(200);

      expect(res.body).toMatchObject({
        status: 'degraded',
        database: 'disconnected',
        valkey: 'disconnected',
      });
    });

    it('should still return an ISO timestamp when degraded', async () => {
      vi.mocked(db.execute).mockRejectedValue(new Error('connection refused'));

      const res = await request(httpServer).get('/health').expect(200);

      expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
    });
  });
});
