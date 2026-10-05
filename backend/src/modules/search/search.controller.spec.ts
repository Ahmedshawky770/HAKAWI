import type { Server } from 'http';

import type { Request as ExpressRequest } from 'express';
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';

import { SearchController } from './search.controller.ts';
import { SearchService } from './search.service.ts';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
type MockSearchService = {
  search: ReturnType<typeof vi.fn>;
  searchAuthors: ReturnType<typeof vi.fn>;
  searchCategories: ReturnType<typeof vi.fn>;
};

describe('SearchController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let searchService: MockSearchService;

  beforeAll(async () => {
    searchService = {
      search: vi.fn(),
      searchAuthors: vi.fn(),
      searchCategories: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [SearchController],
      providers: [
        {
          provide: SearchService,
          useValue: searchService,
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

  describe('GET /search', () => {
    it('should search stories', async () => {
      vi.mocked(searchService.search).mockResolvedValue({
        results: [],
        total: 0,
        page: 1,
        limit: 20,
        query: 'test',
        took: 10,
      });

      const res = await request(httpServer).get('/search?query=test').expect(200);

      expect(res.body).toHaveProperty('results');
      expect(res.body).toHaveProperty('total', 0);
      // Assert the ARGUMENTS, not just that the service was reached. This spec built a bare Nest
      // application with no `useGlobalPipes`, so it structurally cannot observe the global
      // `ValidationPipe` — and it used to assert `?q=test`, which the real app answers 400 because
      // the DTO field is `query` and `main.ts` sets `forbidNonWhitelisted: true`. Asserting only
      // `toHaveBeenCalled()` let a query string the production pipe rejects pass as a green test.
      expect(searchService.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'test' }));
    });
  });

  describe('GET /search/authors', () => {
    it('should search authors', async () => {
      vi.mocked(searchService.searchAuthors).mockResolvedValue({
        authors: [],
        total: 0,
      });

      const res = await request(httpServer).get('/search/authors?q=test').expect(200);

      expect(res.body).toHaveProperty('authors');
      expect(res.body).toHaveProperty('total', 0);
      expect(searchService.searchAuthors).toHaveBeenCalledWith('test', 1, 20);
    });
  });

  describe('GET /search/categories', () => {
    it('should search categories', async () => {
      vi.mocked(searchService.searchCategories).mockResolvedValue([]);

      const res = await request(httpServer).get('/search/categories?q=test').expect(200);

      expect(res.body).toEqual([]);
      expect(searchService.searchCategories).toHaveBeenCalledWith('test');
    });
  });
});
