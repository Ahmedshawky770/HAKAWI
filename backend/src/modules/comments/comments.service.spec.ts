import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommentsService } from './comments.service.js';
import type { ICommentsRepository } from './interfaces/comments-repository.interface.js';
import { COMMENTS_REPOSITORY } from './interfaces/comments-repository.interface.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockCommentsRepository = Partial<ICommentsRepository>;
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};
type MockEventEmitter = { emit: ReturnType<typeof vi.fn> };

describe('CommentsService', () => {
  let commentsService: CommentsService;
  let commentsRepository: MockCommentsRepository;
  let logger: MockWinstonLoggerService;
  let eventEmitter: MockEventEmitter;

  beforeEach(() => {
    commentsRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findByStory: vi.fn(),
      findReplies: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      incrementReplyCount: vi.fn(),
    };

    logger = {
      info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn(),
    };

    eventEmitter = { emit: vi.fn() };

    commentsService = new CommentsService(
      commentsRepository as unknown as ICommentsRepository,
      logger as unknown as WinstonLoggerService,
      eventEmitter as unknown as EventEmitter2,
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
