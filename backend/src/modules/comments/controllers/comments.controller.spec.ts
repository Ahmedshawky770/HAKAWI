import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { CommentsService } from '../comments.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { OWNERSHIP_RESOLVER, OwnershipGuard } from '../../../common/guards/ownership.guard.ts';
import type { OwnershipResolver } from '../../../common/guards/ownership.guard.ts';
import type { Comment, CommentResponse, CreateCommentInput, UpdateCommentInput } from '../types.ts';

import { CommentsController } from './comments.controller.ts';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type CommentListResponse = {
  comments: CommentResponse[];
  total: number;
  page: number;
  limit: number;
};

type ReplyListResponse = {
  replies: CommentResponse[];
  total: number;
  page: number;
  limit: number;
};

type MockCommentsService = {
  findByStory: ReturnType<typeof vi.fn<(storyId: string, page: number, limit: number) => Promise<CommentListResponse>>>;
  findReplies: ReturnType<typeof vi.fn<(parentId: string, page: number, limit: number) => Promise<ReplyListResponse>>>;
  create: ReturnType<typeof vi.fn<(input: CreateCommentInput) => Promise<Comment>>>;
  update: ReturnType<typeof vi.fn<(id: string, authorId: string, input: UpdateCommentInput) => Promise<Comment>>>;
  delete: ReturnType<typeof vi.fn<(id: string, authorId: string) => Promise<void>>>;
};

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment-1',
    storyId: '00000000-0000-0000-0000-000000000001',
    authorId: 'user-1',
    parentId: null,
    content: 'Great story!',
    likeCount: 0,
    replyCount: 0,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CommentsController', () => {
  let app: INestApplication<Server>;
  let commentsService: MockCommentsService;
  let resolveOwnerId: Mock<OwnershipResolver['resolveOwnerId']>;

  beforeAll(async () => {
    commentsService = {
      findByStory: vi.fn<(storyId: string, page: number, limit: number) => Promise<CommentListResponse>>(),
      findReplies: vi.fn<(parentId: string, page: number, limit: number) => Promise<ReplyListResponse>>(),
      create: vi.fn<(input: CreateCommentInput) => Promise<Comment>>(),
      update: vi.fn<(id: string, authorId: string, input: UpdateCommentInput) => Promise<Comment>>(),
      delete: vi.fn<(id: string, authorId: string) => Promise<void>>(),
    };
    resolveOwnerId = vi.fn<OwnershipResolver['resolveOwnerId']>().mockResolvedValue('user-1');

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [CommentsController],
      providers: [
        {
          provide: CommentsService,
          useValue: commentsService,
        },
        JwtAuthGuard,
        // Registered explicitly, and paired with a resolver, because that is what `CommentsModule`
        // does in the application. A guard with no resolver fails closed, so a testing module that
        // forgot the binding would see every write route answer 403 and mistake it for a policy.
        OwnershipGuard,
        { provide: OWNERSHIP_RESOLVER, useValue: { resolveOwnerId } satisfies OwnershipResolver },
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
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // `clearAllMocks` does not undo `mockResolvedValue`, so an IDOR case that installed a different
    // owner would otherwise leak into every later test. Each test starts from "the caller owns it".
    resolveOwnerId.mockResolvedValue('user-1');
  });

  describe('GET /comments/story/:storyId', () => {
    it('should return comments for a story', async () => {
      vi.mocked(commentsService.findByStory).mockResolvedValue({
        comments: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(app.getHttpServer()).get('/comments/story/123e4567-e89b-12d3-a456-426614174000').expect(200);

      expect(res.body).toHaveProperty('comments');
      expect(res.body).toHaveProperty('total', 0);
      expect(commentsService.findByStory).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 1, 20);
    });
  });

  describe('GET /comments/:id/replies', () => {
    it('should return replies for a comment', async () => {
      vi.mocked(commentsService.findReplies).mockResolvedValue({
        replies: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(app.getHttpServer()).get('/comments/123e4567-e89b-12d3-a456-426614174000/replies').expect(200);

      expect(res.body).toHaveProperty('replies');
      expect(res.body).toHaveProperty('total', 0);
      expect(commentsService.findReplies).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 1, 20);
    });
  });

  describe('POST /comments', () => {
    it('should create a new comment', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(commentsService.create).mockResolvedValue(makeComment());

      const res = await request(app.getHttpServer())
        .post('/comments')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyId: '123e4567-e89b-12d3-a456-426614174000', content: 'Great story!' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'comment-1');
      expect(res.body).toHaveProperty('content', 'Great story!');
      expect(commentsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          storyId: '123e4567-e89b-12d3-a456-426614174000',
          content: 'Great story!',
          authorId: 'user-1',
        }),
      );
    });
  });

  describe('PATCH /comments/:id', () => {
    it('should update a comment', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(commentsService.update).mockResolvedValue(makeComment({ content: 'Updated comment' }));

      const res = await request(app.getHttpServer())
        .patch('/comments/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Updated comment' })
        .expect(200);

      expect(res.body).toHaveProperty('content', 'Updated comment');
      expect(commentsService.update).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 'user-1', {
        content: 'Updated comment',
      });
    });

    /**
     * The IDOR this route now refuses before the handler runs. `CommentsService.update` also checks
     * the author, but it checks it *after* the request has been accepted and the row loaded; the
     * guard is the property that a reader of the controller can see.
     */
    it('should refuse an edit by a caller who does not own the comment', async () => {
      const token = await generateToken('user-2', 'test@example.com', 'reader');
      resolveOwnerId.mockResolvedValue('user-1');

      const res = await request(app.getHttpServer())
        .patch('/comments/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hijacked' })
        .expect(403);

      expect(res.body).toHaveProperty('message', 'You do not own this resource');
      expect(commentsService.update).not.toHaveBeenCalled();
    });

    it('should refuse an edit when ownership cannot be established at all', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');
      resolveOwnerId.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/comments/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Unknown owner' })
        .expect(403);

      expect(commentsService.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /comments/:id', () => {
    it('should delete a comment', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(commentsService.delete).mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete('/comments/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Comment deleted' });
      expect(commentsService.delete).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 'user-1');
    });

    it('should refuse a delete by a caller who does not own the comment', async () => {
      const token = await generateToken('user-2', 'test@example.com', 'reader');
      resolveOwnerId.mockResolvedValue('user-1');

      await request(app.getHttpServer())
        .delete('/comments/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(commentsService.delete).not.toHaveBeenCalled();
    });
  });
});
