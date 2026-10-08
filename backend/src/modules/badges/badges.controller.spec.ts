import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { PermissionsGuard } from '../../common/guards/permissions.guard.ts';
import { RestrictionGuard } from '../../common/guards/restriction.guard.ts';
import { RolesGuard } from '../../common/guards/roles.guard.ts';
import { BadgesController } from './badges.controller.ts';
import { BadgesService } from './badges.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';

describe('BadgesController', () => {
  let app: INestApplication;
  let badgesService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    badgesService = {
      listCatalog: vi.fn().mockResolvedValue([]),
      findByUser: vi.fn().mockResolvedValue([]),
      findByUserAndKey: vi.fn().mockResolvedValue([]),
      awardManual: vi.fn().mockResolvedValue({}),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [BadgesController],
      providers: [
        { provide: BadgesService, useValue: badgesService },
        { provide: WinstonLoggerService, useValue: { info: vi.fn(), warn: vi.fn(), log: vi.fn() } },
        { provide: ValkeyService, useValue: { get: vi.fn().mockResolvedValue(null) } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: any) => { const req = ctx.switchToHttp().getRequest(); req.user = { sub: 'u1', accountType: 'reader' }; return true; } })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RestrictionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => { await app?.close(); });

  it('should list badges', async () => {
    const res = await request(app.getHttpServer()).get('/badges').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
