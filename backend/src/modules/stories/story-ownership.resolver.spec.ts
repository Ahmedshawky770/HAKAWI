import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { AuthRequest } from '../../common/types/auth-request.interface.ts';

import { StoryOwnershipResolver } from './story-ownership.resolver.ts';
import type { IStoriesRepository, Story } from './interfaces/stories-repository.interface.ts';

const STORY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const AUTHOR_ID = '9a8f1b2c-4d5e-4f60-8a71-b2c3d4e5f607';

const buildStory = (overrides: Partial<Story> = {}): Story => ({
  id: STORY_ID,
  authorId: AUTHOR_ID,
  title: 'Test Story',
  slug: 'test-story',
  excerpt: null,
  content: null,
  coverImage: null,
  status: 'draft',
  categoryId: null,
  viewCount: 0,
  likeCount: 0,
  commentCount: 0,
  readingTime: null,
  publishedAt: null,
  deletedAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

const requestFor = (params: unknown): AuthRequest => ({ params }) as unknown as AuthRequest;

describe('StoryOwnershipResolver', () => {
  let findById: Mock<IStoriesRepository['findById']>;
  let logger: WinstonLoggerService;
  let resolver: StoryOwnershipResolver;

  beforeEach(() => {
    findById = vi.fn<IStoriesRepository['findById']>();
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
    } as unknown as WinstonLoggerService;
    resolver = new StoryOwnershipResolver({ findById } as unknown as IStoriesRepository, logger);
  });

  it('resolves the author of the addressed story', async () => {
    findById.mockResolvedValue(buildStory());

    await expect(resolver.resolveOwnerId(requestFor({ id: STORY_ID }))).resolves.toBe(AUTHOR_ID);
    expect(findById).toHaveBeenCalledWith(STORY_ID);
  });

  describe('fails closed', () => {
    it('returns null for a story that does not exist', async () => {
      // `StoriesRepository.findById` swallows the invalid-uuid SQLSTATE to `null`, so a malformed
      // `:id` arrives here as "not found" and denies instead of surfacing a 500.
      findById.mockResolvedValue(null);

      await expect(resolver.resolveOwnerId(requestFor({ id: 'slug' }))).resolves.toBeNull();
    });

    it('returns null for a soft deleted story', async () => {
      findById.mockResolvedValue(buildStory({ deletedAt: new Date('2024-02-01T00:00:00.000Z') }));

      await expect(resolver.resolveOwnerId(requestFor({ id: STORY_ID }))).resolves.toBeNull();
    });

    it('returns null and never queries when the route has no usable :id', async () => {
      await expect(resolver.resolveOwnerId(requestFor(undefined))).resolves.toBeNull();
      await expect(resolver.resolveOwnerId(requestFor({}))).resolves.toBeNull();
      await expect(resolver.resolveOwnerId(requestFor({ id: null }))).resolves.toBeNull();
      expect(findById).not.toHaveBeenCalled();
    });

    it('warns when there is no :id, because that is a wiring mistake rather than an attack', async () => {
      await resolver.resolveOwnerId(requestFor({}));
      expect(logger.warn).toHaveBeenCalledWith(
        'Ownership check on a story route with no :id parameter',
        'StoryOwnership',
      );
    });

    it('lets a repository error propagate so the guard reports it as unverified ownership', async () => {
      findById.mockRejectedValue(new Error('column "author_id" does not exist'));

      await expect(resolver.resolveOwnerId(requestFor({ id: STORY_ID }))).rejects.toThrow(
        'column "author_id" does not exist',
      );
    });
  });
});
