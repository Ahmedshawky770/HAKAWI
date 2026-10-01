import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { AuthRequest } from '../../common/types/auth-request.interface.ts';

import { CommentOwnershipResolver } from './comment-ownership.resolver.ts';
import type { Comment, ICommentsRepository } from './interfaces/comments-repository.interface.ts';

const COMMENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const AUTHOR_ID = '9a8f1b2c-4d5e-4f60-8a71-b2c3d4e5f607';

const buildComment = (overrides: Partial<Comment> = {}): Comment => ({
  id: COMMENT_ID,
  storyId: '1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9',
  authorId: AUTHOR_ID,
  parentId: null,
  content: 'Great story!',
  likeCount: 0,
  replyCount: 0,
  isDeleted: false,
  deletedAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

const requestFor = (params: unknown): AuthRequest => ({ params }) as unknown as AuthRequest;

describe('CommentOwnershipResolver', () => {
  let findById: Mock<ICommentsRepository['findById']>;
  let logger: WinstonLoggerService;
  let resolver: CommentOwnershipResolver;

  beforeEach(() => {
    findById = vi.fn<ICommentsRepository['findById']>();
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
    } as unknown as WinstonLoggerService;
    resolver = new CommentOwnershipResolver({ findById } as unknown as ICommentsRepository, logger);
  });

  it('resolves the author of the addressed comment', async () => {
    findById.mockResolvedValue(buildComment());

    await expect(resolver.resolveOwnerId(requestFor({ id: COMMENT_ID }))).resolves.toBe(AUTHOR_ID);
    expect(findById).toHaveBeenCalledWith(COMMENT_ID);
  });

  /**
   * Every one of these is a denial. They are the cases that distinguish a resolver that fails closed
   * from one that returns a value it guessed: a guard that is handed a plausible owner id for an
   * unknown comment is worse than no guard, because it authorises.
   */
  describe('fails closed', () => {
    it('returns null for a comment that does not exist', async () => {
      findById.mockResolvedValue(null);
      await expect(resolver.resolveOwnerId(requestFor({ id: COMMENT_ID }))).resolves.toBeNull();
    });

    it('returns null for a soft deleted comment', async () => {
      // `CommentsService.update` and `delete` both refuse a tombstone, so its author is not an owner
      // of anything actionable.
      findById.mockResolvedValue(buildComment({ isDeleted: true, deletedAt: new Date() }));

      await expect(resolver.resolveOwnerId(requestFor({ id: COMMENT_ID }))).resolves.toBeNull();
    });

    it('returns null and never queries when the route has no :id', async () => {
      await expect(resolver.resolveOwnerId(requestFor(undefined))).resolves.toBeNull();
      await expect(resolver.resolveOwnerId(requestFor({}))).resolves.toBeNull();
      await expect(resolver.resolveOwnerId(requestFor({ id: 42 }))).resolves.toBeNull();
      expect(findById).not.toHaveBeenCalled();
    });

    it('warns when there is no :id, because that is a wiring mistake rather than an attack', async () => {
      await resolver.resolveOwnerId(requestFor({}));
      expect(logger.warn).toHaveBeenCalledWith(
        'Ownership check on a comment route with no :id parameter',
        'CommentOwnership',
      );
    });

    it('lets a repository error propagate so the guard reports it as unverified ownership', async () => {
      // The resolver must not swallow this: `OwnershipGuard` catches it and turns it into
      // `Ownership could not be verified`, which is the honest answer. Turning it into `null` here
      // would report it as "not yours", a different claim.
      findById.mockRejectedValue(new Error('relation "comments" does not exist'));

      await expect(resolver.resolveOwnerId(requestFor({ id: COMMENT_ID }))).rejects.toThrow(
        'relation "comments" does not exist',
      );
    });
  });
});
