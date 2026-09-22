import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoryTagsService } from './story-tags.service.js';
import type { StoryTagsRepository } from '../repositories/story-tags.repository.js';
import { ValkeyService } from '../../../common/services/valkey.service.js';
import { NotFoundException } from '@nestjs/common';

type MockStoryTagsRepository = Partial<StoryTagsRepository>;
type MockValkeyService = Partial<ValkeyService>;

const createMockTag = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'tag-123',
  name: 'Fantasy',
  slug: 'fantasy',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('StoryTagsService', () => {
  let storyTagsService: StoryTagsService;
  let storyTagsRepository: MockStoryTagsRepository;
  let valkeyService: MockValkeyService;

  beforeEach(() => {
    storyTagsRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
    };

    valkeyService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
    };

    storyTagsService = new StoryTagsService(
      storyTagsRepository as StoryTagsRepository,
      valkeyService as ValkeyService,
    );
  });

  describe('findById', () => {
    it('should return tag when found', async () => {
      const tag = createMockTag();
      vi.mocked(storyTagsRepository.findById).mockResolvedValue(tag as any);

      const result = await storyTagsService.findById('tag-123');

      expect(result).toEqual(tag);
    });

    it('should throw NotFoundException when tag not found', async () => {
      vi.mocked(storyTagsRepository.findById).mockResolvedValue(null);

      await expect(storyTagsService.findById('tag-123')).rejects.toThrow('Story tag not found');
    });
  });

  describe('findAll', () => {
    it('should return cached tags when available', async () => {
      const cachedTags = [createMockTag()];
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(cachedTags));

      const result = await storyTagsService.findAll();

      expect(result).toEqual(JSON.parse(JSON.stringify(cachedTags)));
      expect(storyTagsRepository.findAll).not.toHaveBeenCalled();
    });

    it('should fetch from repository and cache when not cached', async () => {
      const tags = [createMockTag()];
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(storyTagsRepository.findAll).mockResolvedValue(tags as any);

      const result = await storyTagsService.findAll();

      expect(result).toEqual(tags);
      expect(valkeyService.set).toHaveBeenCalledWith('story-tags:all', JSON.stringify(tags), 3600);
    });
  });

  describe('create', () => {
    it('should create tag', async () => {
      const tag = createMockTag();
      vi.mocked(storyTagsRepository.create).mockResolvedValue(tag as any);

      const result = await storyTagsService.create({ name: 'Fantasy', slug: 'fantasy' } as any);

      expect(result).toEqual(tag);
    });
  });
});
