import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import type { ICommentReactionsRepository, CommentReaction } from '../interfaces/comments-repository.interface.ts';
import type { ICommentsRepository, Comment } from '../interfaces/comments-repository.interface.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../../common/events/event-validator.service.ts';

import { CommentReactionsService } from './comment-reactions.service.ts';

type MockCommentReactionsRepository = {
  findById: Mock<(id: string) => Promise<CommentReaction | null>>;
  findByUserAndComment: Mock<(userId: string, commentId: string) => Promise<CommentReaction | null>>;
  findByComment: Mock<(commentId: string, page: number, limit: number) => Promise<{ reactions: CommentReaction[]; total: number }>>;
  create: Mock<(data: { userId: string; commentId: string; type: string }) => Promise<CommentReaction>>;
  delete: Mock<(id: string) => Promise<void>>;
  deleteByUserAndComment: Mock<(userId: string, commentId: string) => Promise<void>>;
  countReactions: Mock<(commentId: string) => Promise<number>>;
};
type MockCommentsRepository = {
  findById: Mock<(id: string) => Promise<Comment | null>>;
  findByStory: Mock<(storyId: string, page: number, limit: number) => Promise<{ comments: Comment[]; total: number }>>;
  findReplies: Mock<(parentId: string, page: number, limit: number) => Promise<{ replies: Comment[]; total: number }>>;
  create: Mock<(data: { storyId: string; authorId: string; content: string; parentId?: string }) => Promise<Comment>>;
  update: Mock<(id: string, data: { content: string }) => Promise<Comment>>;
  softDelete: Mock<(id: string) => Promise<void>>;
  incrementReplyCount: Mock<(parentId: string) => Promise<void>>;
  countReplies: Mock<(parentId: string) => Promise<number>>;
};
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};
type MockEventValidatorService = {
  emit: ReturnType<typeof vi.fn>;
  validateEvent: ReturnType<typeof vi.fn>;
};

const createMockComment = (overrides: Partial<Comment> = {}): Comment => ({
  id: 'comment-123',
  storyId: 'story-123',
  authorId: 'user-123',
  parentId: null,
  content: 'Test comment',
  likeCount: 0,
  replyCount: 0,
  isDeleted: false,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockReaction = (overrides: Partial<CommentReaction> = {}): CommentReaction => ({
  id: 'reaction-123',
  userId: 'user-123',
  commentId: 'comment-123',
  type: 'like',
  createdAt: new Date(),
  ...overrides,
});

describe('CommentReactionsService', () => {
  let commentReactionsService: CommentReactionsService;
  let commentReactionsRepository: MockCommentReactionsRepository;
  let commentsRepository: MockCommentsRepository;
  let logger: MockWinstonLoggerService;
  let eventValidatorService: MockEventValidatorService;

  beforeEach(() => {
    commentReactionsRepository = {
      findById: vi.fn(),
      findByUserAndComment: vi.fn(),
      findByComment: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteByUserAndComment: vi.fn(),
      countReactions: vi.fn(),
    };

    commentsRepository = {
      findById: vi.fn(),
      findByStory: vi.fn(),
      findReplies: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      incrementReplyCount: vi.fn(),
      countReplies: vi.fn(),
    };

    logger = {
      info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn(),
    };

    eventValidatorService = { emit: vi.fn(), validateEvent: vi.fn() };

    commentReactionsService = new CommentReactionsService(
      commentReactionsRepository,
      commentsRepository,
      logger as unknown as WinstonLoggerService,
      eventValidatorService as unknown as EventValidatorService,
    );
  });

  describe('addReaction', () => {
    it('should create a new comment reaction', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(createMockComment());
      vi.mocked(commentReactionsRepository.findByUserAndComment).mockResolvedValue(null);
      vi.mocked(commentReactionsRepository.create).mockResolvedValue(createMockReaction());

      const result = await commentReactionsService.addReaction('user-123', 'comment-123', 'like');

      expect(result.type).toBe('like');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('comment.reacted', { userId: 'user-123', commentId: 'comment-123', reactionType: 'like' });
    });

    it('should throw NotFoundException when comment not found', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(null);

      await expect(commentReactionsService.addReaction('user-123', 'comment-123', 'like')).rejects.toThrow('Comment not found');
    });

    it('should throw NotFoundException when reaction already exists', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(createMockComment());
      vi.mocked(commentReactionsRepository.findByUserAndComment).mockResolvedValue(createMockReaction());

      await expect(commentReactionsService.addReaction('user-123', 'comment-123', 'like')).rejects.toThrow('Reaction already exists');
    });

    it('should throw NotFoundException for invalid reaction type', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(createMockComment());

      await expect(commentReactionsService.addReaction('user-123', 'comment-123', 'invalid')).rejects.toThrow('Invalid reaction type');
    });
  });

  describe('removeReaction', () => {
    it('should remove comment reaction successfully', async () => {
      vi.mocked(commentReactionsRepository.findByUserAndComment).mockResolvedValue(createMockReaction());

      await commentReactionsService.removeReaction('user-123', 'comment-123');

      expect(commentReactionsRepository.deleteByUserAndComment).toHaveBeenCalledWith('user-123', 'comment-123');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('comment.reaction.removed', { userId: 'user-123', commentId: 'comment-123' });
    });

    it('should throw NotFoundException when reaction not found', async () => {
      vi.mocked(commentReactionsRepository.findByUserAndComment).mockResolvedValue(null);

      await expect(commentReactionsService.removeReaction('user-123', 'comment-123')).rejects.toThrow('Reaction not found');
    });
  });

  describe('getReactions', () => {
    it('should return reactions for a comment', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(createMockComment());
      vi.mocked(commentReactionsRepository.findByComment).mockResolvedValue({ reactions: [createMockReaction()], total: 1 });

      const result = await commentReactionsService.getReactions('comment-123', 1, 20);

      expect(result.reactions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should throw NotFoundException when comment not found', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(null);

      await expect(commentReactionsService.getReactions('comment-123')).rejects.toThrow('Comment not found');
    });
  });
});
