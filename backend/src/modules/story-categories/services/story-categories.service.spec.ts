import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoryCategoriesService } from './story-categories.service.js';
import type { StoryCategoriesRepository } from '../repositories/story-categories.repository.js';
import { ValkeyService } from '../../../common/services/valkey.service.js';
import { NotFoundException } from '@nestjs/common';

type MockStoryCategoriesRepository = Partial<StoryCategoriesRepository>;
type MockValkeyService = Partial<ValkeyService>;

const createMockCategory = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'category-123',
  name: 'Fiction',
  slug: 'fiction',
  description: 'Fiction stories',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('StoryCategoriesService', () => {
  let storyCategoriesService: StoryCategoriesService;
  let storyCategoriesRepository: MockStoryCategoriesRepository;
  let valkeyService: MockValkeyService;

  beforeEach(() => {
    storyCategoriesRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    valkeyService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
    };

    storyCategoriesService = new StoryCategoriesService(
      storyCategoriesRepository as StoryCategoriesRepository,
      valkeyService as ValkeyService,
    );
  });

  describe('findById', () => {
    it('should return category when found', async () => {
      const category = createMockCategory();
      vi.mocked(storyCategoriesRepository.findById).mockResolvedValue(category as any);

      const result = await storyCategoriesService.findById('category-123');

      expect(result).toEqual(category);
    });

    it('should throw NotFoundException when category not found', async () => {
      vi.mocked(storyCategoriesRepository.findById).mockResolvedValue(null);

      await expect(storyCategoriesService.findById('category-123')).rejects.toThrow('Story category not found');
    });
  });

  describe('findAll', () => {
    it('should return cached categories when available', async () => {
      const cachedCategories = [createMockCategory()];
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(cachedCategories));

      const result = await storyCategoriesService.findAll();

      expect(result).toEqual(JSON.parse(JSON.stringify(cachedCategories)));
      expect(storyCategoriesRepository.findAll).not.toHaveBeenCalled();
    });

    it('should fetch from repository and cache when not cached', async () => {
      const categories = [createMockCategory()];
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(storyCategoriesRepository.findAll).mockResolvedValue(categories as any);

      const result = await storyCategoriesService.findAll();

      expect(result).toEqual(categories);
      expect(valkeyService.set).toHaveBeenCalledWith('story-categories:all', JSON.stringify(categories), 3600);
    });
  });

  describe('create', () => {
    it('should create category', async () => {
      const category = createMockCategory();
      vi.mocked(storyCategoriesRepository.create).mockResolvedValue(category as any);

      const result = await storyCategoriesService.create({ name: 'Fiction', slug: 'fiction', description: 'Fiction stories' } as any);

      expect(result).toEqual(category);
    });
  });

  describe('update', () => {
    it('should update category', async () => {
      const updatedCategory = createMockCategory({ name: 'Updated Fiction' });
      vi.mocked(storyCategoriesRepository.findById).mockResolvedValue(createMockCategory() as any);
      vi.mocked(storyCategoriesRepository.update).mockResolvedValue(updatedCategory as any);

      const result = await storyCategoriesService.update('category-123', { name: 'Updated Fiction' } as any);

      expect(result).toEqual(updatedCategory);
    });
  });
});
