import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import { TagsService } from './tags.service.ts';
import type { ITagsRepository, Tag, CreateTagInput, UpdateTagInput } from './interfaces/tags-repository.interface.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockTagsRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Tag | null>>>;
  findBySlug: ReturnType<typeof vi.fn<(slug: string) => Promise<Tag | null>>>;
  findAll: ReturnType<typeof vi.fn<() => Promise<Tag[]>>>;
  create: ReturnType<typeof vi.fn<(data: CreateTagInput) => Promise<Tag>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: UpdateTagInput) => Promise<Tag>>>;
};
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

const mockTag = {
  id: 'tag-123',
  name: 'Test Tag',
  slug: 'test-tag',
  createdAt: new Date('2024-01-01'),
};

describe('TagsService', () => {
  let tagsService: TagsService;
  let tagsRepository: MockTagsRepository;
  let logger: MockWinstonLoggerService;

  beforeEach(() => {
    tagsRepository = {
      findById: vi.fn<(id: string) => Promise<Tag | null>>(),
      findBySlug: vi.fn<(slug: string) => Promise<Tag | null>>(),
      findAll: vi.fn<() => Promise<Tag[]>>(),
      create: vi.fn<(data: CreateTagInput) => Promise<Tag>>(),
      update: vi.fn<(id: string, data: UpdateTagInput) => Promise<Tag>>(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    tagsService = new TagsService(tagsRepository, logger as unknown as WinstonLoggerService);
  });

  describe('findById', () => {
    it('should return a tag by id', async () => {
      vi.mocked(tagsRepository.findById).mockResolvedValue(mockTag);

      const result = await tagsService.findById('tag-123');

      expect(result).toEqual(mockTag);
      expect(tagsRepository.findById).toHaveBeenCalledWith('tag-123');
    });

    it('should throw NotFoundException when tag not found', async () => {
      vi.mocked(tagsRepository.findById).mockResolvedValue(null);

      await expect(tagsService.findById('tag-999')).rejects.toThrow('Tag not found');
      await expect(tagsService.findById('tag-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySlug', () => {
    it('should return a tag by slug', async () => {
      vi.mocked(tagsRepository.findBySlug).mockResolvedValue(mockTag);

      const result = await tagsService.findBySlug('test-tag');

      expect(result).toEqual(mockTag);
      expect(tagsRepository.findBySlug).toHaveBeenCalledWith('test-tag');
    });

    it('should throw NotFoundException when tag slug not found', async () => {
      vi.mocked(tagsRepository.findBySlug).mockResolvedValue(null);

      await expect(tagsService.findBySlug('non-existent')).rejects.toThrow('Tag not found');
      await expect(tagsService.findBySlug('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all tags', async () => {
      const tags = [mockTag];
      vi.mocked(tagsRepository.findAll).mockResolvedValue(tags);

      const result = await tagsService.findAll();

      expect(result).toEqual(tags);
      expect(tagsRepository.findAll).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a tag successfully', async () => {
      vi.mocked(tagsRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(tagsRepository.create).mockResolvedValue(mockTag);

      const result = await tagsService.create({
        name: 'Test Tag',
        slug: 'test-tag',
      });

      expect(result).toEqual(mockTag);
      expect(tagsRepository.create).toHaveBeenCalledWith({
        name: 'Test Tag',
        slug: 'test-tag',
      });
    });

    it('should throw ConflictException when slug already exists', async () => {
      vi.mocked(tagsRepository.findBySlug).mockResolvedValue(mockTag);

      await expect(
        tagsService.create({
          name: 'Test Tag',
          slug: 'test-tag',
        }),
      ).rejects.toThrow('Tag slug already exists');
      await expect(
        tagsService.create({
          name: 'Test Tag',
          slug: 'test-tag',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update a tag successfully', async () => {
      vi.mocked(tagsRepository.findById).mockResolvedValue(mockTag);
      vi.mocked(tagsRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(tagsRepository.update).mockResolvedValue({
        ...mockTag,
        name: 'Updated Tag',
      });

      const result = await tagsService.update('tag-123', { name: 'Updated Tag' });

      expect(result.name).toBe('Updated Tag');
      expect(tagsRepository.update).toHaveBeenCalledWith('tag-123', { name: 'Updated Tag' });
    });

    it('should throw NotFoundException when tag to update does not exist', async () => {
      vi.mocked(tagsRepository.findById).mockResolvedValue(null);

      await expect(tagsService.update('tag-999', { name: 'Updated' })).rejects.toThrow('Tag not found');
      await expect(tagsService.update('tag-999', { name: 'Updated' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when updating to an existing slug', async () => {
      vi.mocked(tagsRepository.findById).mockResolvedValue(mockTag);
      vi.mocked(tagsRepository.findBySlug).mockResolvedValue({
        ...mockTag,
        id: 'other-tag',
      });

      await expect(tagsService.update('tag-123', { slug: 'existing-slug' })).rejects.toThrow('Tag slug already exists');
      await expect(tagsService.update('tag-123', { slug: 'existing-slug' })).rejects.toThrow(ConflictException);
    });

    it('should allow updating to the same slug', async () => {
      vi.mocked(tagsRepository.findById).mockResolvedValue(mockTag);
      vi.mocked(tagsRepository.update).mockResolvedValue({
        ...mockTag,
        name: 'Updated Tag',
      });

      const result = await tagsService.update('tag-123', { name: 'Updated Tag', slug: 'test-tag' });

      expect(result.name).toBe('Updated Tag');
      expect(tagsRepository.update).toHaveBeenCalledWith('tag-123', { name: 'Updated Tag', slug: 'test-tag' });
    });
  });
});
