import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { PermissionsGuard } from '../../../common/guards/permissions.guard.ts';
import { RestrictionGuard } from '../../../common/guards/restriction.guard.ts';
import { ReactionsService } from '../reactions.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import type { Reaction, ReactionCounts } from '../types.ts';

import { ReactionsController } from './reactions.controller.ts';

type ReactionsServiceMock = {
  addReaction: ReturnType<typeof vi.fn<(userId: string, storyId: string, type: string) => Promise<Reaction>>>;
  removeReaction: ReturnType<typeof vi.fn<(userId: string, storyId: string) => Promise<void>>>;
  getReactions: ReturnType<
    typeof vi.fn<
      (
        storyId: string,
        page?: number,
        limit?: number,
      ) => Promise<{ reactions: Reaction[]; total: number; page: number; limit: number }>
    >
  >;
  getReactionCounts: ReturnType<typeof vi.fn<(storyId: string) => Promise<ReactionCounts>>>;
  getUserReaction: ReturnType<typeof vi.fn<(userId: string, storyId: string) => Promise<Reaction | null>>>;
};

function makeReaction(): Reaction {
  return {
    id: 'reaction-1',
    userId: 'u1',
    storyId: 's1',
    type: 'like',
    createdAt: new Date('2024-01-01'),
  };
}

describe('ReactionsController', () => {
  let app: INestApplication<Server>;
  let service: ReactionsServiceMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = {
      addReaction: vi
        .fn<(userId: string, storyId: string, type: string) => Promise<Reaction>>()
        .mockResolvedValue(makeReaction()),
      removeReaction: vi
        .fn<(userId: string, storyId: string) => Promise<void>>()
        .mockResolvedValue(undefined),
      getReactions: vi
        .fn<
          (
            storyId: string,
            page?: number,
            limit?: number,
          ) => Promise<{ reactions: Reaction[]; total: number; page: number; limit: number }>
        >()
        .mockResolvedValue({ reactions: [], total: 0, page: 1, limit: 20 }),
      getReactionCounts: vi.fn<(storyId: string) => Promise<ReactionCounts>>().mockResolvedValue({}),
      getUserReaction: vi.fn<(userId: string, storyId: string) => Promise<Reaction | null>>().mockResolvedValue(null),
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

  it('should get reactions for story', async () => {
    const res = await request(app.getHttpServer())
      .get('/reactions/stories/123e4567-e89b-12d3-a456-426614174000')
      .expect(200);
    expect(res.body).toBeDefined();
  });
});
