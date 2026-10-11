import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { PermissionsGuard } from '../../common/guards/permissions.guard.ts';
import { RestrictionGuard } from '../../common/guards/restriction.guard.ts';
import { RolesGuard } from '../../common/guards/roles.guard.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';

import { BadgesController } from './badges.controller.ts';
import type { AwardedBadge, BadgeCatalogEntry } from './badges.service.ts';
import { BadgesService } from './badges.service.ts';

type BadgesServiceMock = {
  listCatalog: ReturnType<typeof vi.fn<() => Promise<BadgeCatalogEntry[]>>>;
  findByUser: ReturnType<typeof vi.fn<(userId: string) => Promise<AwardedBadge[]>>>;
  findByUserAndKey: ReturnType<
    typeof vi.fn<(userId: string, badgeKey: string) => Promise<AwardedBadge>>
  >;
  awardManual: ReturnType<
    typeof vi.fn<(userId: string, badgeKey: string) => Promise<AwardedBadge>>
  >;
};

function makeAwardedBadge(): AwardedBadge {
  return {
    id: 'user-badge-1',
    badgeId: 'badge-1',
    badgeKey: 'first-story',
    name: 'First Story',
    description: null,
    icon: null,
    awardedAt: new Date('2024-01-01'),
  };
}

describe('BadgesController', () => {
  let app: INestApplication<Server>;
  let badgesService: BadgesServiceMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    badgesService = {
      listCatalog: vi.fn<() => Promise<BadgeCatalogEntry[]>>().mockResolvedValue([]),
      findByUser: vi.fn<(userId: string) => Promise<AwardedBadge[]>>().mockResolvedValue([]),
      findByUserAndKey: vi
        .fn<(userId: string, badgeKey: string) => Promise<AwardedBadge>>()
        .mockResolvedValue(makeAwardedBadge()),
      awardManual: vi
        .fn<(userId: string, badgeKey: string) => Promise<AwardedBadge>>()
        .mockResolvedValue(makeAwardedBadge()),
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
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest<{ user?: unknown }>();
          req.user = { sub: 'u1', accountType: 'reader' };
          return true;
        },
      })
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
