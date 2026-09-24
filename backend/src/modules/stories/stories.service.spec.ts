import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoriesService } from './stories.service.js';
import type { IStoriesRepository } from './interfaces/stories-repository.interface.js';
import { STORIES_REPOSITORY } from './interfaces/stories-repository.interface.js';
import type { Story, CreateStoryInput, UpdateStoryInput } from './types.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockStoriesRepository = Partial<IStoriesRepository>;

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

type MockValkeyService = {
  exists: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

type MockEventEmitter = {
  emit: ReturnType<typeof vi.fn>;
};

describe('StoriesService', () => {
  let storiesService: StoriesService;
  let storiesRepository: MockStoriesRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: MockValkeyService;
  let eventEmitter: MockEventEmitter;

  const mockStory: Story = {
    id: 'story-123',
    authorId: 'author-123',
    title: 'Test Story',
    slug: 'test-story',
    excerpt: 'Test excerpt',
    content: '<p>Test content</p>',
    coverImage: 'https://example.com/cover.jpg',
    status: 'draft',
    categoryId: null,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    readingTime: 5,
    publishedAt: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    storiesRepository = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      incrementViewCount: vi.fn(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    valkeyService = {
      exists: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
    };

    storiesService = new StoriesService(
      storiesRepository as unknown as IStoriesRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as ValkeyService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('create', () => {
    it('should create a story successfully', async () => {
      const createInput: CreateStoryInput = {
        authorId: 'author-123',
        title: 'New Story',
        slug: 'new-story',
        content: '<p>Content</p>',
        categoryId: null,
      };

      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(storiesRepository.create).mockResolvedValue({
        ...mockStory,
        ...createInput,
        id: 'story-123',
      });

      const result = await storiesService.create('author-123', createInput);

      expect(result).toHaveProperty('id', 'story-123');
      expect(result.title).toBe('New Story');
      expect(result.slug).toBe('new-story');
      expect(result.status).toBe('draft');
      expect(storiesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: 'author-123',
          title: 'New Story',
          slug: 'new-story',
          status: 'draft',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('story.created', expect.any(Object));
    });

    it('should throw ConflictException when slug already exists', async () => {
      const createInput: CreateStoryInput = {
        authorId: 'author-123',
        title: 'New Story',
        slug: 'existing-slug',
      };

      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(mockStory);

      await expect(storiesService.create('author-123', createInput)).rejects.toThrow('Story slug already exists');
    });

    it('should propagate repository error on slug check', async () => {
      const createInput: CreateStoryInput = {
        authorId: 'author-123',
        title: 'New Story',
        slug: 'new-story',
      };

      vi.mocked(storiesRepository.findBySlug).mockRejectedValue(new Error('DB error'));

      await expect(storiesService.create('author-123', createInput)).rejects.toThrow('DB error');
    });
  });

  describe('findById', () => {
    it('should return a story by id', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(valkeyService.get).mockResolvedValue(null);

      const result = await storiesService.findById('story-123');

      expect(result).toEqual(mockStory);
      expect(storiesRepository.findById).toHaveBeenCalledWith('story-123');
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.findById('story-999')).rejects.toThrow('Story not found');
    });
  });

  describe('findBySlug', () => {
    it('should return a story by slug', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(mockStory);
      vi.mocked(valkeyService.get).mockResolvedValue(null);

      const result = await storiesService.findBySlug('test-story');

      expect(result).toEqual(mockStory);
      expect(storiesRepository.findBySlug).toHaveBeenCalledWith('test-story');
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(null);

      await expect(storiesService.findBySlug('non-existent')).rejects.toThrow('Story not found');
    });
  });

  describe('findAll', () => {
    it('should return paginated stories', async () => {
      const mockStories = [mockStory];
      vi.mocked(storiesRepository.findAll).mockResolvedValue({ stories: mockStories, total: 1 });

      const result = await storiesService.findAll({ page: 1, limit: 20 });

      expect(result.stories).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(storiesRepository.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        authorId: undefined,
        categoryId: undefined,
        status: undefined,
        search: undefined,
      });
    });

    it('should pass filters to repository', async () => {
      vi.mocked(storiesRepository.findAll).mockResolvedValue({ stories: [], total: 0 });

      await storiesService.findAll({ page: 2, limit: 10, authorId: 'author-123', status: 'published', search: 'test' });

      expect(storiesRepository.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        authorId: 'author-123',
        categoryId: undefined,
        status: 'published',
        search: 'test',
      });
    });
  });

  describe('update', () => {
    it('should update a story successfully', async () => {
      const updateInput: UpdateStoryInput = {
        title: 'Updated Title',
        content: '<p>Updated content</p>',
      };

      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.update).mockResolvedValue({
        ...mockStory,
        ...updateInput,
      });

      const result = await storiesService.update('story-123', updateInput);

      expect(result.title).toBe('Updated Title');
      expect(result.content).toBe('<p>Updated content</p>');
      expect(storiesRepository.update).toHaveBeenCalledWith('story-123', expect.objectContaining(updateInput));
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.update('story-999', { title: 'New Title' })).rejects.toThrow('Story not found');
    });
  });

  describe('publish', () => {
    it('should publish a draft story', async () => {
      const draftStory = { ...mockStory, status: 'draft', publishedAt: null };
      const publishedStory = { ...draftStory, status: 'published', publishedAt: new Date() };

      vi.mocked(storiesRepository.findById).mockResolvedValue(draftStory);
      vi.mocked(storiesRepository.update).mockResolvedValue(publishedStory);

      const result = await storiesService.publish('story-123');

      expect(result.status).toBe('published');
      expect(result.publishedAt).not.toBeNull();
      expect(storiesRepository.update).toHaveBeenCalledWith(
        'story-123',
        expect.objectContaining({ status: 'published', publishedAt: expect.any(Date) }),
      );
    });

    it('should throw ForbiddenException when story is already published', async () => {
      const publishedStory = { ...mockStory, status: 'published' };
      vi.mocked(storiesRepository.findById).mockResolvedValue(publishedStory);

      await expect(storiesService.publish('story-123')).rejects.toThrow('Story is already published');
    });

    it('should throw ForbiddenException when story is archived', async () => {
      const archivedStory = { ...mockStory, status: 'archived' };
      vi.mocked(storiesRepository.findById).mockResolvedValue(archivedStory);

      await expect(storiesService.publish('story-123')).rejects.toThrow('Cannot publish an archived story');
    });
  });

  describe('archive', () => {
    it('should archive a published story', async () => {
      const publishedStory = { ...mockStory, status: 'published' };
      const archivedStory = { ...publishedStory, status: 'archived' };

      vi.mocked(storiesRepository.findById).mockResolvedValue(publishedStory);
      vi.mocked(storiesRepository.update).mockResolvedValue(archivedStory);

      const result = await storiesService.archive('story-123');

      expect(result.status).toBe('archived');
      expect(storiesRepository.update).toHaveBeenCalledWith(
        'story-123',
        expect.objectContaining({ status: 'archived' }),
      );
    });

    it('should throw ForbiddenException when story is already archived', async () => {
      const archivedStory = { ...mockStory, status: 'archived' };
      vi.mocked(storiesRepository.findById).mockResolvedValue(archivedStory);

      await expect(storiesService.archive('story-123')).rejects.toThrow('Story is already archived');
    });
  });

  describe('delete', () => {
    it('should soft delete a story', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.softDelete).mockResolvedValue(undefined);

      await storiesService.delete('story-123');

      expect(storiesRepository.softDelete).toHaveBeenCalledWith('story-123');
      expect(eventEmitter.emit).toHaveBeenCalledWith('story.deleted', expect.any(Object));
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.delete('story-999')).rejects.toThrow('Story not found');
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.incrementViewCount).mockResolvedValue(undefined);

      await storiesService.incrementViewCount('story-123');

      expect(storiesRepository.incrementViewCount).toHaveBeenCalledWith('story-123');
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.incrementViewCount('story-999')).rejects.toThrow('Story not found');
    });
  });
});
