import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import { CategoriesService } from './categories.service.ts';
import type { ICategoriesRepository, Category, CreateCategoryInput, UpdateCategoryInput } from './interfaces/categories-repository.interface.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockCategoriesRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Category | null>>>;
  findBySlug: ReturnType<typeof vi.fn<(slug: string) => Promise<Category | null>>>;
  findAll: ReturnType<typeof vi.fn<() => Promise<Category[]>>>;
  create: ReturnType<typeof vi.fn<(data: CreateCategoryInput) => Promise<Category>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: UpdateCategoryInput) => Promise<Category>>>;
  softDelete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
};
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

const mockCategory = {
  id: 'category-123',
  name: 'Test Category',
  slug: 'test-category',
  description: 'A test category',
  parentId: null,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('CategoriesService', () => {
  let categoriesService: CategoriesService;
  let categoriesRepository: MockCategoriesRepository;
  let logger: MockWinstonLoggerService;

  beforeEach(() => {
    categoriesRepository = {
      findById: vi.fn<(id: string) => Promise<Category | null>>(),
      findBySlug: vi.fn<(slug: string) => Promise<Category | null>>(),
      findAll: vi.fn<() => Promise<Category[]>>(),
      create: vi.fn<(data: CreateCategoryInput) => Promise<Category>>(),
      update: vi.fn<(id: string, data: UpdateCategoryInput) => Promise<Category>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    categoriesService = new CategoriesService(
      categoriesRepository,
      logger as unknown as WinstonLoggerService,
    );
  });

  describe('findById', () => {
    it('should return a category by id', async () => {
      vi.mocked(categoriesRepository.findById).mockResolvedValue(mockCategory);

      const result = await categoriesService.findById('category-123');

      expect(result).toEqual(mockCategory);
      expect(categoriesRepository.findById).toHaveBeenCalledWith('category-123');
    });

    it('should throw NotFoundException when category not found', async () => {
      vi.mocked(categoriesRepository.findById).mockResolvedValue(null);

      await expect(categoriesService.findById('category-999')).rejects.toThrow('Category not found');
      await expect(categoriesService.findById('category-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySlug', () => {
    it('should return a category by slug', async () => {
      vi.mocked(categoriesRepository.findBySlug).mockResolvedValue(mockCategory);

      const result = await categoriesService.findBySlug('test-category');

      expect(result).toEqual(mockCategory);
      expect(categoriesRepository.findBySlug).toHaveBeenCalledWith('test-category');
    });

    it('should throw NotFoundException when category slug not found', async () => {
      vi.mocked(categoriesRepository.findBySlug).mockResolvedValue(null);

      await expect(categoriesService.findBySlug('non-existent')).rejects.toThrow('Category not found');
      await expect(categoriesService.findBySlug('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all categories', async () => {
      const categories = [mockCategory];
      vi.mocked(categoriesRepository.findAll).mockResolvedValue(categories);

      const result = await categoriesService.findAll();

      expect(result).toEqual(categories);
      expect(categoriesRepository.findAll).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a category successfully', async () => {
      vi.mocked(categoriesRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(categoriesRepository.create).mockResolvedValue(mockCategory);

      const result = await categoriesService.create({
        name: 'Test Category',
        slug: 'test-category',
        description: 'A test category',
      });

      expect(result).toEqual(mockCategory);
      expect(categoriesRepository.create).toHaveBeenCalledWith({
        name: 'Test Category',
        slug: 'test-category',
        description: 'A test category',
        parentId: undefined,
        sortOrder: undefined,
      });
    });

    it('should throw ConflictException when slug already exists', async () => {
      vi.mocked(categoriesRepository.findBySlug).mockResolvedValue(mockCategory);

      await expect(categoriesService.create({
        name: 'Test Category',
        slug: 'test-category',
      })).rejects.toThrow('Category slug already exists');
      await expect(categoriesService.create({
        name: 'Test Category',
        slug: 'test-category',
      })).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update a category successfully', async () => {
      vi.mocked(categoriesRepository.findById).mockResolvedValue(mockCategory);
      vi.mocked(categoriesRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(categoriesRepository.update).mockResolvedValue({
        ...mockCategory,
        name: 'Updated Category',
      });

      const result = await categoriesService.update('category-123', { name: 'Updated Category' });

      expect(result.name).toBe('Updated Category');
      expect(categoriesRepository.update).toHaveBeenCalledWith('category-123', { name: 'Updated Category' });
    });

    it('should throw NotFoundException when category to update does not exist', async () => {
      vi.mocked(categoriesRepository.findById).mockResolvedValue(null);

      await expect(categoriesService.update('category-999', { name: 'Updated' })).rejects.toThrow('Category not found');
      await expect(categoriesService.update('category-999', { name: 'Updated' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when updating to an existing slug', async () => {
      vi.mocked(categoriesRepository.findById).mockResolvedValue(mockCategory);
      vi.mocked(categoriesRepository.findBySlug).mockResolvedValue({
        ...mockCategory,
        id: 'other-category',
      });

      await expect(categoriesService.update('category-123', { slug: 'existing-slug' })).rejects.toThrow('Category slug already exists');
      await expect(categoriesService.update('category-123', { slug: 'existing-slug' })).rejects.toThrow(ConflictException);
    });

    it('should allow updating to the same slug', async () => {
      vi.mocked(categoriesRepository.findById).mockResolvedValue(mockCategory);
      vi.mocked(categoriesRepository.update).mockResolvedValue({
        ...mockCategory,
        name: 'Updated Category',
      });

      const result = await categoriesService.update('category-123', { name: 'Updated Category', slug: 'test-category' });

      expect(result.name).toBe('Updated Category');
      expect(categoriesRepository.update).toHaveBeenCalledWith('category-123', { name: 'Updated Category', slug: 'test-category' });
    });
  });

  describe('delete', () => {
    it('should soft delete a category', async () => {
      vi.mocked(categoriesRepository.findById).mockResolvedValue(mockCategory);
      vi.mocked(categoriesRepository.softDelete).mockResolvedValue(undefined);

      await categoriesService.delete('category-123');

      expect(categoriesRepository.softDelete).toHaveBeenCalledWith('category-123');
    });

    it('should throw NotFoundException when category to delete does not exist', async () => {
      vi.mocked(categoriesRepository.findById).mockResolvedValue(null);

      await expect(categoriesService.delete('category-999')).rejects.toThrow('Category not found');
      await expect(categoriesService.delete('category-999')).rejects.toThrow(NotFoundException);
    });
  });
});
