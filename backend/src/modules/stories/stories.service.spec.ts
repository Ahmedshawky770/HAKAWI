import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoriesService, STORY_STATUS } from './services/stories.service.js';
import type { StoriesRepository } from '../repositories/stories.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ValkeyService } from '../../../common/services/valkey.service.js';
import { NotFoundException, BadRequestException } from '@nestjs/common';

type MockStoriesRepository = Partial<StoriesRepository>;
type MockEventEmitter2 = Partial<EventEmitter2>;
type MockValkeyService = Partial<ValkeyService>;

const createMockStory = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'story-123',
  sanityStoryId: null,
  authorId: 'user-123',
  title: 'Test Story',
  slug: 'test-story',
  description: 'Test description',
  coverImage: null,
  status: 'draft',
  wordCount: 100,
  readingTime: 1,
  views: 0,
  reactions: 0,
  comments: 0,
  category: 'fiction',
  tags: ['tag1'],
  publishedAt: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('StoriesService', () => {
  let storiesService: StoriesService;
  let storiesRepository: MockStoriesRepository;
  let eventEmitter: MockEventEmitter2;
  let valkeyService: MockValkeyService;

  beforeEach(() => {
    storiesRepository = {
      findPublished: vi.fn(),
      findById: vi.fn(),
      findByAuthorId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      incrementViews: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    valkeyService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
    };

    storiesService = new StoriesService(
      storiesRepository as StoriesRepository,
      eventEmitter as EventEmitter2,
      valkeyService as ValkeyService,
    );
  });

  describe('findPublished', () => {
    it('should return cached stories when available', async () => {
      const cachedStories = [createMockStory()];
      const cacheKey = 'stories:published:{}';
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(cachedStories));

      const result = await storiesService.findPublished({});

      expect(result).toEqual(JSON.parse(JSON.stringify(cachedStories)));
      expect(storiesRepository.findPublished).not.toHaveBeenCalled();
    });

    it('should fetch from repository and cache when not cached', async () => {
      const stories = [createMockStory()];
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(storiesRepository.findPublished).mockResolvedValue(stories as any);

      const result = await storiesService.findPublished({});

      expect(result).toEqual(stories);
      expect(valkeyService.set).toHaveBeenCalledWith(
        'stories:published:{}',
        JSON.stringify(stories),
        300,
      );
    });
  });

  describe('findById', () => {
    it('should return cached story when available', async () => {
      const cachedStory = createMockStory();
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(cachedStory));

      const result = await storiesService.findById('story-123');

      expect(result).toEqual(JSON.parse(JSON.stringify(cachedStory)));
      expect(storiesRepository.findById).not.toHaveBeenCalled();
    });

    it('should fetch from repository and cache when not cached', async () => {
      const story = createMockStory();
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);

      const result = await storiesService.findById('story-123');

      expect(result).toEqual(story);
      expect(valkeyService.set).toHaveBeenCalledWith(
        'story:story-123',
        JSON.stringify(story),
        600,
      );
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.findById('story-123')).rejects.toThrow('Story not found');
    });

    it('should throw NotFoundException when story is soft deleted', async () => {
      const deletedStory = createMockStory({ deletedAt: new Date() });
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(storiesRepository.findById).mockResolvedValue(deletedStory as any);

      await expect(storiesService.findById('story-123')).rejects.toThrow('Story not found');
    });
  });

  describe('findByAuthorId', () => {
    it('should return stories by author', async () => {
      const stories = [createMockStory()];
      vi.mocked(storiesRepository.findByAuthorId).mockResolvedValue(stories as any);

      const result = await storiesService.findByAuthorId('user-123');

      expect(result).toEqual(stories);
    });
  });

  describe('create', () => {
    it('should create story with slug and reading time', async () => {
      const data = { title: 'Test Story', content: 'This is a test story with many words', category: 'fiction', tags: ['tag1'] };
      const createdStory = createMockStory({ title: data.title });
      vi.mocked(storiesRepository.create).mockResolvedValue(createdStory as any);

      const result = await storiesService.create('user-123', data as any);

      expect(result.title).toBe(data.title);
      expect(result.slug).toBe('test-story');
      expect(eventEmitter.emit).toHaveBeenCalledWith('story.created', {
        storyId: 'story-123',
        authorId: 'user-123',
        title: 'Test Story',
        category: 'fiction',
      });
    });

    it('should calculate reading time based on word count', async () => {
      const data = { title: 'Test Story', content: 'word '.repeat(200), category: 'fiction', tags: [] };
      const createdStory = createMockStory({ wordCount: 200, readingTime: 1 });
      vi.mocked(storiesRepository.create).mockResolvedValue(createdStory as any);

      await storiesService.create('user-123', data as any);

      expect(storiesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          wordCount: 200,
          readingTime: 1,
        }),
      );
    });
  });

  describe('update', () => {
    it('should update story successfully', async () => {
      const story = createMockStory({ authorId: 'user-123' });
      const updatedStory = createMockStory({ title: 'Updated Title', slug: 'updated-title' });
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);
      vi.mocked(storiesRepository.update).mockResolvedValue(updatedStory as any);

      const result = await storiesService.update('story-123', 'user-123', { title: 'Updated Title' } as any);

      expect(result.title).toBe('Updated Title');
      expect(eventEmitter.emit).toHaveBeenCalledWith('story.updated', {
        storyId: 'story-123',
        authorId: 'user-123',
        changes: expect.any(Array),
      });
    });

    it('should throw BadRequestException when updating another users story', async () => {
      const story = createMockStory({ authorId: 'other-user' });
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);

      await expect(storiesService.update('story-123', 'user-123', { title: 'Updated' } as any))
        .rejects.toThrow('You can only update your own stories');
    });
  });

  describe('delete', () => {
    it('should delete story successfully', async () => {
      const story = createMockStory({ authorId: 'user-123' });
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);
      vi.mocked(storiesRepository.delete).mockResolvedValue(undefined as any);

      await storiesService.delete('story-123', 'user-123');

      expect(storiesRepository.delete).toHaveBeenCalledWith('story-123');
      expect(eventEmitter.emit).toHaveBeenCalledWith('story.deleted', {
        storyId: 'story-123',
        authorId: 'user-123',
      });
    });

    it('should throw BadRequestException when deleting another users story', async () => {
      const story = createMockStory({ authorId: 'other-user' });
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);

      await expect(storiesService.delete('story-123', 'user-123')).rejects.toThrow('You can only delete your own stories');
    });
  });

  describe('publish', () => {
    it('should publish draft story', async () => {
      const story = createMockStory({ status: STORY_STATUS.DRAFT });
      const publishedStory = createMockStory({ status: STORY_STATUS.PENDING, publishedAt: new Date() });
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);
      vi.mocked(storiesRepository.update).mockResolvedValue(publishedStory as any);

      const result = await storiesService.publish('story-123', 'user-123');

      expect(result.status).toBe(STORY_STATUS.PENDING);
      expect(eventEmitter.emit).toHaveBeenCalledWith('story.published', expect.any(Object));
    });

    it('should throw BadRequestException when publishing another users story', async () => {
      const story = createMockStory({ authorId: 'other-user', status: STORY_STATUS.DRAFT });
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);

      await expect(storiesService.publish('story-123', 'user-123')).rejects.toThrow('You can only publish your own stories');
    });

    it('should throw BadRequestException when publishing non-draft story', async () => {
      const story = createMockStory({ authorId: 'user-123', status: STORY_STATUS.PENDING });
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);

      await expect(storiesService.publish('story-123', 'user-123')).rejects.toThrow('Only draft stories can be published');
    });
  });

  describe('approve', () => {
    it('should approve pending story', async () => {
      const story = createMockStory({ status: STORY_STATUS.PENDING });
      const approvedStory = createMockStory({ status: STORY_STATUS.PUBLISHED });
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);
      vi.mocked(storiesRepository.update).mockResolvedValue(approvedStory as any);

      const result = await storiesService.approve('story-123');

      expect(result.status).toBe(STORY_STATUS.PUBLISHED);
    });

    it('should throw BadRequestException when approving non-pending story', async () => {
      const story = createMockStory({ status: STORY_STATUS.DRAFT });
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);

      await expect(storiesService.approve('story-123')).rejects.toThrow('Only pending stories can be approved');
    });
  });

  describe('reject', () => {
    it('should reject pending story', async () => {
      const story = createMockStory({ status: STORY_STATUS.PENDING });
      const rejectedStory = createMockStory({ status: STORY_STATUS.REJECTED });
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);
      vi.mocked(storiesRepository.update).mockResolvedValue(rejectedStory as any);

      const result = await storiesService.reject('story-123', 'Inappropriate content');

      expect(result.status).toBe(STORY_STATUS.REJECTED);
    });

    it('should throw BadRequestException when rejecting non-pending story', async () => {
      const story = createMockStory({ status: STORY_STATUS.DRAFT });
      vi.mocked(storiesRepository.findById).mockResolvedValue(story as any);

      await expect(storiesService.reject('story-123', 'Inappropriate')).rejects.toThrow('Only pending stories can be rejected');
    });
  });

  describe('incrementViews', () => {
    it('should increment story views', async () => {
      vi.mocked(storiesRepository.incrementViews).mockResolvedValue(undefined as any);

      await storiesService.incrementViews('story-123');

      expect(storiesRepository.incrementViews).toHaveBeenCalledWith('story-123');
    });
  });
});
