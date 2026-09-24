import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoriesEventHandler } from './stories.event-handler.js';
import type { IStoriesRepository } from '../interfaces/stories-repository.interface.js';
import { STORIES_REPOSITORY } from '../interfaces/stories-repository.interface.js';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.js';

type MockStoriesRepository = Partial<IStoriesRepository>;

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

  beforeEach(() => {
    storiesRepository = {
      findById: vi.fn(),
      update: vi.fn(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    storiesEventHandler = new StoriesEventHandler(
      storiesRepository as unknown as IStoriesRepository,
      logger as unknown as WinstonLoggerService,
    );
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
