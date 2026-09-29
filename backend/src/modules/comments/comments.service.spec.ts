import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import type { EventValidatorService } from '../../common/events/event-validator.service.js';

import { CommentsService } from './comments.service.js';
import type { ICommentsRepository, CreateCommentInput, UpdateCommentInput } from './interfaces/comments-repository.interface.js';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockCommentsRepository = {
  findById: ReturnType<typeof vi.fn>;
  findByStory: ReturnType<typeof vi.fn>;
  findReplies: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  softDelete: ReturnType<typeof vi.fn>;
  incrementReplyCount: ReturnType<typeof vi.fn>;
  countReplies: ReturnType<typeof vi.fn>;
};
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

describe('CommentsService', () => {
  let commentsService: CommentsService;
  let commentsRepository: MockCommentsRepository;
  let logger: MockWinstonLoggerService;
  let eventEmitter: EventValidatorService;

  beforeEach(() => {
    commentsRepository = {
      findById: vi.fn<(id: string) => Promise<Comment | null>>(),
      findByStory: vi.fn<(storyId: string, page: number, limit: number) => Promise<{ comments: Comment[]; total: number }>>(),
      findReplies: vi.fn<(parentId: string, page: number, limit: number) => Promise<{ replies: Comment[]; total: number }>>(),
      create: vi.fn<(data: CreateCommentInput) => Promise<Comment>>(),
      update: vi.fn<(id: string, data: UpdateCommentInput) => Promise<Comment>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
      incrementReplyCount: vi.fn<(parentId: string) => Promise<void>>(),
      countReplies: vi.fn<(parentId: string) => Promise<number>>(),
    };

    logger = {
      info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn(),
    };

    eventEmitter = { emit: vi.fn() } as unknown as EventValidatorService;

    commentsService = new CommentsService(
      commentsRepository as unknown as ICommentsRepository,
      logger as unknown as WinstonLoggerService,
      eventEmitter,
    );
  });

  describe('create', () => {
    it('should create a comment', async () => {
      vi.mocked(commentsRepository.create).mockResolvedValue({
        id: 'comment-123', storyId: 'story-1', authorId: 'user-1', parentId: null,
        content: 'Great story!', likeCount: 0, replyCount: 0, isDeleted: false, deletedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await commentsService.create({ storyId: 'story-1', authorId: 'user-1', content: 'Great story!' });

      expect(result.content).toBe('Great story!');
      expect(eventEmitter.emit).toHaveBeenCalledWith('comment.created', { commentId: 'comment-123', storyId: 'story-1', authorId: 'user-1' });
    });

    it('should increment reply count when replying', async () => {
      vi.mocked(commentsRepository.create).mockResolvedValue({
        id: 'reply-123', storyId: 'story-1', authorId: 'user-2', parentId: 'comment-123',
        content: 'Thanks!', likeCount: 0, replyCount: 0, isDeleted: false, deletedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });

      await commentsService.create({ storyId: 'story-1', authorId: 'user-2', content: 'Thanks!', parentId: 'comment-123' });

      expect(commentsRepository.incrementReplyCount).toHaveBeenCalledWith('comment-123');
    });
  });

  describe('update', () => {
    it('should update own comment', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue({
        id: 'comment-123', storyId: 'story-1', authorId: 'user-1', parentId: null,
        content: 'Old content', likeCount: 0, replyCount: 0, isDeleted: false, deletedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
      vi.mocked(commentsRepository.update).mockResolvedValue({
        id: 'comment-123', storyId: 'story-1', authorId: 'user-1', parentId: null,
        content: 'New content', likeCount: 0, replyCount: 0, isDeleted: false, deletedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await commentsService.update('comment-123', 'user-1', { content: 'New content' });

      expect(result.content).toBe('New content');
    });

    it('should throw ForbiddenException when updating others comment', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue({
        id: 'comment-123', storyId: 'story-1', authorId: 'user-1', parentId: null,
        content: 'Content', likeCount: 0, replyCount: 0, isDeleted: false, deletedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });

      await expect(commentsService.update('comment-123', 'user-2', { content: 'Hacked' })).rejects.toThrow('You can only edit your own comments');
    });
  });

  describe('delete', () => {
    it('should soft delete comment', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue({
        id: 'comment-123', storyId: 'story-1', authorId: 'user-1', parentId: null,
        content: 'Content', likeCount: 0, replyCount: 0, isDeleted: false, deletedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });

      await commentsService.delete('comment-123', 'user-1');

      expect(commentsRepository.softDelete).toHaveBeenCalledWith('comment-123');
      expect(eventEmitter.emit).toHaveBeenCalledWith('comment.deleted', { commentId: 'comment-123', storyId: 'story-1' });
    });
  });
});
