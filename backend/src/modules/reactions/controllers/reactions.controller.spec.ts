import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { PermissionsGuard } from '../../../common/guards/permissions.guard.ts';
import { RestrictionGuard } from '../../../common/guards/restriction.guard.ts';
import { ReactionsController } from './reactions.controller.ts';
import { ReactionsService } from '../reactions.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';

describe('ReactionsController', () => {
  let app: INestApplication;
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = {
      addReaction: vi.fn().mockResolvedValue({}),
      removeReaction: vi.fn().mockResolvedValue({}),
      getReactions: vi.fn().mockResolvedValue({ reactions: [], total: 0 }),
      getReactionCounts: vi.fn().mockResolvedValue({}),
      getUserReaction: vi.fn().mockResolvedValue(null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ReactionsController],
      providers: [
        { provide: ReactionsService, useValue: service },
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

  it('should get reactions for story', async () => {
    const res = await request(app.getHttpServer())
      .get('/reactions/stories/123e4567-e89b-12d3-a456-426614174000')
      .expect(200);
    expect(res.body).toBeDefined();
  });
});
