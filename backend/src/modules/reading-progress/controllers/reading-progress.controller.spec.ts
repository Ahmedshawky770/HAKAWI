import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { PermissionsGuard } from '../../../common/guards/permissions.guard.ts';
import { RestrictionGuard } from '../../../common/guards/restriction.guard.ts';
import { ReadingProgressService } from '../reading-progress.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import type {
  CreateReadingProgressInput,
  ReadingProgress,
  ReadingProgressListResponse,
  UpdateReadingProgressInput,
} from '../types.ts';

import { ReadingProgressController } from './reading-progress.controller.ts';

type ReadingProgressListParams = { bookId?: string; page?: number; limit?: number };

type ReadingProgressServiceMock = {
  create: ReturnType<typeof vi.fn<(userId: string, input: CreateReadingProgressInput) => Promise<ReadingProgress>>>;
  findById: ReturnType<typeof vi.fn<(id: string, userId: string) => Promise<ReadingProgress>>>;
  findMyProgress: ReturnType<
    typeof vi.fn<(userId: string, params: ReadingProgressListParams) => Promise<ReadingProgressListResponse>>
  >;
  update: ReturnType<
    typeof vi.fn<(id: string, userId: string, input: UpdateReadingProgressInput) => Promise<ReadingProgress>>
  >;
  delete: ReturnType<typeof vi.fn<(id: string, userId: string) => Promise<void>>>;
};

function makeProgress(): ReadingProgress {
  return {
    id: 'progress-1',
    userId: 'u1',
    bookId: 'book-1',
    currentPage: 1,
    totalPages: 200,
    progressPercentage: 1,
    startedAt: '2024-01-01T00:00:00.000Z',
    lastReadAt: '2024-01-01T00:00:00.000Z',
    completedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('ReadingProgressController', () => {
  let app: INestApplication<Server>;
  let service: ReadingProgressServiceMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = {
      create: vi
        .fn<(userId: string, input: CreateReadingProgressInput) => Promise<ReadingProgress>>()
        .mockResolvedValue(makeProgress()),
      findById: vi.fn<(id: string, userId: string) => Promise<ReadingProgress>>().mockResolvedValue(makeProgress()),
      findMyProgress: vi
        .fn<(userId: string, params: ReadingProgressListParams) => Promise<ReadingProgressListResponse>>()
        .mockResolvedValue({ progress: [makeProgress()], total: 1, page: 1, limit: 20 }),
      update: vi
        .fn<(id: string, userId: string, input: UpdateReadingProgressInput) => Promise<ReadingProgress>>()
        .mockResolvedValue(makeProgress()),
      delete: vi.fn<(id: string, userId: string) => Promise<void>>().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ReadingProgressController],
      providers: [
        { provide: ReadingProgressService, useValue: service },
        { provide: WinstonLoggerService, useValue: { info: vi.fn() } },
        { provide: ValkeyService, useValue: { get: vi.fn().mockResolvedValue(null) } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest<{ user?: unknown }>();
          req.user = { sub: 'u1' };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RestrictionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => { await app?.close(); });

  it('should get my progress', async () => {
    const res = await request(app.getHttpServer())
      .get('/reading-progress')
      .expect(200);
    expect(res.body).toEqual({ progress: [expect.objectContaining({ id: 'progress-1' })], total: 1, page: 1, limit: 20 });
  });
});
