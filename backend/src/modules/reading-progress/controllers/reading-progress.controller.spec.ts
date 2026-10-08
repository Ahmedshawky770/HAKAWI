import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { PermissionsGuard } from '../../../common/guards/permissions.guard.ts';
import { RestrictionGuard } from '../../../common/guards/restriction.guard.ts';
import { ReadingProgressController } from './reading-progress.controller.ts';
import { ReadingProgressService } from '../reading-progress.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';

describe('ReadingProgressController', () => {
  let app: INestApplication;
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = {
      create: vi.fn().mockResolvedValue({}),
      findById: vi.fn().mockResolvedValue(null),
      findMyProgress: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue({}),
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
      .useValue({ canActivate: (ctx: any) => { const req = ctx.switchToHttp().getRequest(); req.user = { sub: 'u1' }; return true; } })
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
    expect(Array.isArray(res.body)).toBe(true);
  });
});
