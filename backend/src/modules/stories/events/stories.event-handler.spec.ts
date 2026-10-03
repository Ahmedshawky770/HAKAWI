import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { IStoriesRepository, Story } from '../interfaces/stories-repository.interface.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../../shared/cache/tagged-cache.service.ts';
import { STORY_CACHE_NAMESPACE, STORIES_CACHE_TAG } from '../stories.service.ts';

import { StoriesEventHandler } from './stories.event-handler.ts';

type MockStoriesRepository = {
  findById: ReturnType<typeof vi.fn>;
  findBySlug: ReturnType<typeof vi.fn>;
  findAll: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  softDelete: ReturnType<typeof vi.fn>;
  incrementViewCount: ReturnType<typeof vi.fn>;
  incrementLikeCount: ReturnType<typeof vi.fn>;
  decrementLikeCount: ReturnType<typeof vi.fn>;
  incrementCommentCount: ReturnType<typeof vi.fn>;
  decrementCommentCount: ReturnType<typeof vi.fn>;
};

type MockTaggedCacheService = {
  getOrSet: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  invalidateKey: ReturnType<typeof vi.fn>;
  invalidateTags: ReturnType<typeof vi.fn>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

describe('StoriesEventHandler', () => {
  let storiesEventHandler: StoriesEventHandler;
  let storiesRepository: MockStoriesRepository;
  let logger: MockWinstonLoggerService;
  let cache: MockTaggedCacheService;

  beforeEach(() => {
    storiesRepository = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      incrementViewCount: vi.fn(),
      incrementLikeCount: vi.fn(),
      decrementLikeCount: vi.fn(),
      incrementCommentCount: vi.fn(),
      decrementCommentCount: vi.fn(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    // The handler also takes the cache, because a counter bump has to drop the cached story row:
    // `likeCount` and `commentCount` ride inside `StoriesService.findById`'s payload, so bumping
    // the database without invalidating the key would serve the pre-reaction number for 600s.
    cache = {
      invalidateKey: vi.fn().mockResolvedValue(undefined),
      invalidateTags: vi.fn().mockResolvedValue(undefined),
      getOrSet: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    };

    storiesEventHandler = new StoriesEventHandler(
      storiesRepository as unknown as IStoriesRepository,
      logger as unknown as WinstonLoggerService,
      cache as unknown as TaggedCacheService,
    );
  });

  /**
   * The counters this handler now owns were, before the fix, initialised to 0 by `create` and never
   * written again — so `StoryResponse.reactions` and the search index's `sortBy=reactions` were
   * permanently reading zero. These cases pin the four writers and the cache invalidation.
   */
  describe('denormalised counters', () => {
    it('should increment the like count and drop the cached story on a reaction', async () => {
      await storiesEventHandler.handleStoryReacted({ userId: 'user-1', storyId: 'story-1', reactionType: 'like' });

      expect(storiesRepository.incrementLikeCount).toHaveBeenCalledWith('story-1');
      expect(cache.invalidateKey).toHaveBeenCalledWith(STORY_CACHE_NAMESPACE, 'story-1', [STORIES_CACHE_TAG]);
    });

    it('should decrement the like count and drop the cached story when a reaction is removed', async () => {
      await storiesEventHandler.handleStoryReactionRemoved({ userId: 'user-1', storyId: 'story-1' });

      expect(storiesRepository.decrementLikeCount).toHaveBeenCalledWith('story-1');
      expect(cache.invalidateKey).toHaveBeenCalledWith(STORY_CACHE_NAMESPACE, 'story-1', [STORIES_CACHE_TAG]);
    });

    it('should count replies as comments, because the story total is what the column means', async () => {
      await storiesEventHandler.handleCommentCreated({
        commentId: 'comment-1',
        storyId: 'story-1',
        authorId: 'user-1',
        parentId: 'parent-1',
      });

      expect(storiesRepository.incrementCommentCount).toHaveBeenCalledWith('story-1');
    });

    it('should decrement the comment count when a comment is deleted', async () => {
      await storiesEventHandler.handleCommentDeleted({ commentId: 'comment-1', storyId: 'story-1' });

      expect(storiesRepository.decrementCommentCount).toHaveBeenCalledWith('story-1');
    });

    it('should log and swallow a counter failure rather than fail the caller action', async () => {
      // The reaction is already committed when this runs. Throwing would report the user's action
      // as failed and invite a retry that collides with the unique index on the reaction itself.
      vi.mocked(storiesRepository.incrementLikeCount).mockRejectedValue(new Error('db down'));

      await expect(
        storiesEventHandler.handleStoryReacted({ userId: 'user-1', storyId: 'story-1', reactionType: 'like' }),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalled();
      expect(cache.invalidateKey).not.toHaveBeenCalled();
    });
  });

  describe('handleStoryCreated', () => {
    it('should log story created event', async () => {
      await storiesEventHandler.handleStoryCreated({ storyId: 'story-123', authorId: 'author-123' });

      expect(logger.info).toHaveBeenCalledWith('Handling story created event: story-123', 'StoriesEventHandler');
    });
  });

  describe('handleStoryUpdated', () => {
    it('should log story updated event', async () => {
      await storiesEventHandler.handleStoryUpdated({ storyId: 'story-123', updatedFields: { title: 'New Title' } });

      expect(logger.info).toHaveBeenCalledWith('Handling story updated event: story-123', 'StoriesEventHandler');
    });
  });

  describe('handleStoryPublished', () => {
    it('should log story published event', async () => {
      await storiesEventHandler.handleStoryPublished({ storyId: 'story-123', publishedAt: new Date() });

      expect(logger.info).toHaveBeenCalledWith('Handling story published event: story-123', 'StoriesEventHandler');
    });
  });

  describe('handleStoryArchived', () => {
    it('should log story archived event', async () => {
      await storiesEventHandler.handleStoryArchived({ storyId: 'story-123' });

      expect(logger.info).toHaveBeenCalledWith('Handling story archived event: story-123', 'StoriesEventHandler');
    });
  });

  describe('handleStoryDeleted', () => {
    it('should log story deleted event', async () => {
      await storiesEventHandler.handleStoryDeleted({ storyId: 'story-123', authorId: 'author-123' });

      expect(logger.info).toHaveBeenCalledWith('Handling story deleted event: story-123', 'StoriesEventHandler');
    });
  });
});
