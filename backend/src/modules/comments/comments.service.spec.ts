import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import type { EventValidatorService } from '../../common/events/event-validator.service.js';

import { CommentsService } from './comments.service.js';
import type {
  ICommentsRepository,
  CreateCommentInput,
  UpdateCommentInput,
} from './interfaces/comments-repository.interface.js';

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
  decrementReplyCount: ReturnType<typeof vi.fn>;
  countReplies: ReturnType<typeof vi.fn>;
  incrementLikeCount: ReturnType<typeof vi.fn>;
  decrementLikeCount: ReturnType<typeof vi.fn>;
  findAuthorsByIds: ReturnType<typeof vi.fn>;
};

/** A stored comment row, as `CommentsRepository` returns it. Overridable per test. */
const commentRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'comment-1',
  storyId: 'story-1',
  authorId: 'user-1',
  parentId: null,
  content: 'Body',
  likeCount: 0,
  replyCount: 0,
  isDeleted: false,
  deletedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

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
      findByStory:
        vi.fn<(storyId: string, page: number, limit: number) => Promise<{ comments: Comment[]; total: number }>>(),
      findReplies:
        vi.fn<(parentId: string, page: number, limit: number) => Promise<{ replies: Comment[]; total: number }>>(),
      create: vi.fn<(data: CreateCommentInput) => Promise<Comment>>(),
      update: vi.fn<(id: string, data: UpdateCommentInput) => Promise<Comment>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
      incrementReplyCount: vi.fn<(parentId: string) => Promise<void>>(),
      decrementReplyCount: vi.fn<(parentId: string) => Promise<void>>(),
      incrementLikeCount: vi.fn<(commentId: string) => Promise<void>>(),
      decrementLikeCount: vi.fn<(commentId: string) => Promise<void>>(),
      findAuthorsByIds: vi.fn<(authorIds: string[]) => Promise<{ id: string; name: string }[]>>(),
      countReplies: vi.fn<(parentId: string) => Promise<number>>(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
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
        id: 'comment-123',
        storyId: 'story-1',
        authorId: 'user-1',
        parentId: null,
        content: 'Great story!',
        likeCount: 0,
        replyCount: 0,
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await commentsService.create({ storyId: 'story-1', authorId: 'user-1', content: 'Great story!' });

      expect(result.content).toBe('Great story!');
      expect(eventEmitter.emit).toHaveBeenCalledWith('comment.created', {
        commentId: 'comment-123',
        storyId: 'story-1',
        authorId: 'user-1',
      });
    });

    it('should increment reply count when replying', async () => {
      // `create` now loads the parent before writing: an unknown uuid, a parent from another
      // story, a deleted parent and a third level are all rejected, because the self-referencing
      // foreign key proves none of them. So the parent has to exist in the test.
      vi.mocked(commentsRepository.findById).mockResolvedValue({
        id: 'comment-123',
        storyId: 'story-1',
        authorId: 'user-1',
        parentId: null,
        content: 'Root comment',
        likeCount: 0,
        replyCount: 0,
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(commentsRepository.create).mockResolvedValue({
        id: 'reply-123',
        storyId: 'story-1',
        authorId: 'user-2',
        parentId: 'comment-123',
        content: 'Thanks!',
        likeCount: 0,
        replyCount: 0,
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await commentsService.create({
        storyId: 'story-1',
        authorId: 'user-2',
        content: 'Thanks!',
        parentId: 'comment-123',
      });

      expect(commentsRepository.incrementReplyCount).toHaveBeenCalledWith('comment-123');
    });
  });

  /**
   * `authorName` is a required string in the shared contract and the frontend renders it, but
   * `toCommentResponse` hardcoded `''`. Every comment in the product therefore displayed with a
   * blank author. These are the regression guard.
   */
  describe('author name resolution', () => {
    it('should carry the real author name onto a comment response', async () => {
      vi.mocked(commentsRepository.findByStory).mockResolvedValue({ comments: [commentRow()], total: 1 });
      vi.mocked(commentsRepository.findAuthorsByIds).mockResolvedValue([{ id: 'user-1', name: 'Ahmad' }]);

      const result = await commentsService.findByStory('story-1');

      expect(result.comments[0]?.authorName).toBe('Ahmad');
    });

    it('should resolve a name per author once for the whole page, not once per comment', async () => {
      vi.mocked(commentsRepository.findByStory).mockResolvedValue({
        comments: [commentRow(), commentRow({ id: 'comment-2' }), commentRow({ id: 'comment-3' })],
        total: 3,
      });
      vi.mocked(commentsRepository.findAuthorsByIds).mockResolvedValue([{ id: 'user-1', name: 'Ahmad' }]);

      const result = await commentsService.findByStory('story-1');

      // One call, one distinct id — a per-row lookup would be 3 round trips on a public endpoint.
      expect(commentsRepository.findAuthorsByIds).toHaveBeenCalledTimes(1);
      expect(commentsRepository.findAuthorsByIds).toHaveBeenCalledWith(['user-1']);
      expect(result.comments.map((c) => c.authorName)).toEqual(['Ahmad', 'Ahmad', 'Ahmad']);
    });

    it('should resolve a distinct name for each distinct author on a page', async () => {
      vi.mocked(commentsRepository.findReplies).mockResolvedValue({
        replies: [commentRow(), commentRow({ id: 'comment-2', authorId: 'user-2' })],
        total: 2,
      });
      vi.mocked(commentsRepository.findAuthorsByIds).mockResolvedValue([
        { id: 'user-1', name: 'Ahmad' },
        { id: 'user-2', name: 'Sara' },
      ]);

      const result = await commentsService.findReplies('comment-1');

      expect(result.replies.map((r) => r.authorName)).toEqual(['Ahmad', 'Sara']);
    });

    it('should not query authors at all for an empty page', async () => {
      vi.mocked(commentsRepository.findByStory).mockResolvedValue({ comments: [], total: 0 });

      const result = await commentsService.findByStory('story-1');

      expect(result.comments).toEqual([]);
      expect(commentsRepository.findAuthorsByIds).not.toHaveBeenCalled();
    });

    it('should fall back to an empty name when the user row is gone', async () => {
      // comments.author_id is NOT NULL REFERENCES users(id), so this is only reachable for a row
      // whose user was removed out of band. An empty string is the honest "no name"; a placeholder
      // like "Unknown" would render as if it were a real author's name.
      vi.mocked(commentsRepository.findByStory).mockResolvedValue({ comments: [commentRow()], total: 1 });
      vi.mocked(commentsRepository.findAuthorsByIds).mockResolvedValue([]);

      const result = await commentsService.findByStory('story-1');

      expect(result.comments[0]?.authorName).toBe('');
    });
  });

  /**
   * `comments.parent_id` references `comments.id`, which proves only that SOME comment has that
   * id. It says nothing about which story the parent is on, whether it is still readable, or how
   * deep the thread is — and all three fail silently. The read side is already two levels deep
   * (`findByStory` returns `parent_id IS NULL`, `findReplies` returns direct children), so a
   * third level is unreachable through the API and the check is one comparison.
   */
  describe('parent validation on create', () => {
    const reply = { storyId: 'story-1', authorId: 'user-2', content: 'Reply', parentId: 'comment-123' };

    it('should reject a parent id that does not exist', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(null);

      await expect(commentsService.create(reply)).rejects.toThrow('Parent comment not found');
      expect(commentsRepository.create).not.toHaveBeenCalled();
    });

    it('should reject a soft-deleted parent', async () => {
      // Otherwise the parent's counter rises for a thread nobody can read, and findReplies filters
      // deleted rows — so the counter and the listing disagree permanently.
      vi.mocked(commentsRepository.findById).mockResolvedValue(commentRow({ id: 'comment-123', isDeleted: true }));

      await expect(commentsService.create(reply)).rejects.toThrow('Parent comment not found');
      expect(commentsRepository.create).not.toHaveBeenCalled();
    });

    it('should reject a parent from a different story', async () => {
      // A cross-story parentId satisfies the FK and produces a reply listed under a story it does
      // not belong to, and invisible from the other one.
      vi.mocked(commentsRepository.findById).mockResolvedValue(commentRow({ id: 'comment-123', storyId: 'story-2' }));

      await expect(commentsService.create(reply)).rejects.toThrow('Parent comment belongs to a different story');
      expect(commentsRepository.create).not.toHaveBeenCalled();
    });

    it('should reject a third level of nesting', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(
        commentRow({ id: 'comment-123', parentId: 'comment-0' }),
      );

      await expect(commentsService.create(reply)).rejects.toThrow('Replies cannot be nested more than two levels deep');
      expect(commentsRepository.create).not.toHaveBeenCalled();
    });

    it('should accept a top-level parent on the same story', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(commentRow({ id: 'comment-123' }));
      vi.mocked(commentsRepository.create).mockResolvedValue(commentRow({ id: 'reply-1', parentId: 'comment-123' }));

      await commentsService.create(reply);

      expect(commentsRepository.create).toHaveBeenCalledTimes(1);
      expect(commentsRepository.incrementReplyCount).toHaveBeenCalledWith('comment-123');
    });

    it('should not look up a parent when the comment is top-level', async () => {
      vi.mocked(commentsRepository.create).mockResolvedValue(commentRow());

      await commentsService.create({ storyId: 'story-1', authorId: 'user-2', content: 'Top level' });

      expect(commentsRepository.findById).not.toHaveBeenCalled();
    });
  });

  /**
   * `reply_count` was raised on create and never lowered, so it only ever climbed while the
   * replies list beside it shrank.
   */
  describe('reply count on delete', () => {
    it('should decrement the parent counter when a reply is deleted', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(
        commentRow({ id: 'reply-1', authorId: 'user-2', parentId: 'comment-123' }),
      );
      vi.mocked(commentsRepository.softDelete).mockResolvedValue(undefined);

      await commentsService.delete('reply-1', 'user-2');

      expect(commentsRepository.decrementReplyCount).toHaveBeenCalledWith('comment-123');
      expect(commentsRepository.softDelete).toHaveBeenCalledWith('reply-1');
    });

    it('should not touch a counter when a top-level comment is deleted', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(commentRow({ id: 'comment-1', parentId: null }));
      vi.mocked(commentsRepository.softDelete).mockResolvedValue(undefined);

      await commentsService.delete('comment-1', 'user-1');

      expect(commentsRepository.decrementReplyCount).not.toHaveBeenCalled();
    });

    it('should not decrement before the ownership check passes', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue(commentRow({ id: 'reply-1', parentId: 'comment-123' }));

      await expect(commentsService.delete('reply-1', 'someone-else')).rejects.toThrow(
        'You can only delete your own comments',
      );

      expect(commentsRepository.decrementReplyCount).not.toHaveBeenCalled();
      expect(commentsRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update own comment', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue({
        id: 'comment-123',
        storyId: 'story-1',
        authorId: 'user-1',
        parentId: null,
        content: 'Old content',
        likeCount: 0,
        replyCount: 0,
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(commentsRepository.update).mockResolvedValue({
        id: 'comment-123',
        storyId: 'story-1',
        authorId: 'user-1',
        parentId: null,
        content: 'New content',
        likeCount: 0,
        replyCount: 0,
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await commentsService.update('comment-123', 'user-1', { content: 'New content' });

      expect(result.content).toBe('New content');
    });

    it('should throw ForbiddenException when updating others comment', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue({
        id: 'comment-123',
        storyId: 'story-1',
        authorId: 'user-1',
        parentId: null,
        content: 'Content',
        likeCount: 0,
        replyCount: 0,
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(commentsService.update('comment-123', 'user-2', { content: 'Hacked' })).rejects.toThrow(
        'You can only edit your own comments',
      );
    });
  });

  describe('delete', () => {
    it('should soft delete comment', async () => {
      vi.mocked(commentsRepository.findById).mockResolvedValue({
        id: 'comment-123',
        storyId: 'story-1',
        authorId: 'user-1',
        parentId: null,
        content: 'Content',
        likeCount: 0,
        replyCount: 0,
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await commentsService.delete('comment-123', 'user-1');

      expect(commentsRepository.softDelete).toHaveBeenCalledWith('comment-123');
      expect(eventEmitter.emit).toHaveBeenCalledWith('comment.deleted', {
        commentId: 'comment-123',
        storyId: 'story-1',
      });
    });
  });

  describe('pagination envelope', () => {
    it('should report the page and limit it read for a story comment page', async () => {
      vi.mocked(commentsRepository.findByStory).mockResolvedValue({ comments: [], total: 33 });

      const result = await commentsService.findByStory('story-1', 4, 5);

      expect(result.page).toBe(4);
      expect(result.limit).toBe(5);
      expect(result.total).toBe(33);
      expect(commentsRepository.findByStory).toHaveBeenCalledWith('story-1', 4, 5);
    });

    it('should report the page and limit it read for a reply page', async () => {
      vi.mocked(commentsRepository.findReplies).mockResolvedValue({ replies: [], total: 2 });

      const result = await commentsService.findReplies('comment-1', 2, 50);

      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
      expect(commentsRepository.findReplies).toHaveBeenCalledWith('comment-1', 2, 50);
    });

    it('should default to the first page of twenty rather than claiming an empty page', async () => {
      vi.mocked(commentsRepository.findByStory).mockResolvedValue({ comments: [], total: 0 });

      const result = await commentsService.findByStory('story-1');

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });
});
