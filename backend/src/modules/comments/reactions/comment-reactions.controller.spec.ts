import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { PermissionsGuard } from '../../../common/guards/permissions.guard.ts';
import { RestrictionGuard } from '../../../common/guards/restriction.guard.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import type { CommentReaction } from '../interfaces/comments-repository.interface.ts';

import { CommentReactionsController } from './comment-reactions.controller.ts';
import { CommentReactionsService } from './comment-reactions.service.ts';

type CommentReactionsServiceMock = {
  addReaction: ReturnType<typeof vi.fn<(userId: string, commentId: string, type: string) => Promise<CommentReaction>>>;
  removeReaction: ReturnType<typeof vi.fn<(userId: string, commentId: string) => Promise<void>>>;
  getReactions: ReturnType<
    typeof vi.fn<
      (
        commentId: string,
        page?: number,
        limit?: number,
      ) => Promise<{ reactions: CommentReaction[]; total: number }>
    >
  >;
};

function makeReaction(): CommentReaction {
  return {
    id: 'reaction-1',
    userId: 'u1',
    commentId: 'c1',
    type: 'like',
    createdAt: new Date('2024-01-01'),
  };
}

describe('CommentReactionsController', () => {
  let app: INestApplication<Server>;
  let service: CommentReactionsServiceMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = {
      addReaction: vi
        .fn<(userId: string, commentId: string, type: string) => Promise<CommentReaction>>()
        .mockResolvedValue(makeReaction()),
      removeReaction: vi
        .fn<(userId: string, commentId: string) => Promise<void>>()
        .mockResolvedValue(undefined),
      getReactions: vi
        .fn<
          (
            commentId: string,
            page?: number,
            limit?: number,
          ) => Promise<{ reactions: CommentReaction[]; total: number }>
        >()
        .mockResolvedValue({ reactions: [], total: 0 }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [CommentReactionsController],
      providers: [
        { provide: CommentReactionsService, useValue: service },
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

  it('should get reactions for comment', async () => {
    const res = await request(app.getHttpServer())
      .get('/comments/c1/reactions')
      .expect(200);
    expect(res.body).toBeDefined();
  });
});
