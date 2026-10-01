import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';

import { SearchService } from './search.service.ts';
import type { ISearchRepository } from './interfaces/search-repository.interface.ts';

type MockSearchRepository = {
  searchStories: ReturnType<
    typeof vi.fn<
      (filters: {
        query?: string;
        category?: string;
        tag?: string;
        authorId?: string;
        status?: string;
        page: number;
        limit: number;
        sortBy: string;
      }) => Promise<{
        results: {
          id: string;
          title: string;
          slug: string;
          excerpt: string | null;
          status: string;
          category: string | null;
          tags: string[];
          author: { id: string; name: string };
          views: number;
          reactions: number;
          createdAt: string;
        }[];
        total: number;
      }>
    >
  >;
  searchAuthors: ReturnType<
    typeof vi.fn<
      (
        query: string,
        page: number,
        limit: number,
      ) => Promise<{ authors: { id: string; name: string; storiesCount: number }[]; total: number }>
    >
  >;
  searchCategories: ReturnType<
    typeof vi.fn<(query: string) => Promise<{ id: string; name: string; slug: string; storiesCount: number }[]>>
  >;
};

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

describe('SearchService', () => {
  let searchService: SearchService;
  let searchRepository: MockSearchRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: MockValkeyService;

  beforeEach(() => {
    searchRepository = {
      searchStories: vi.fn(),
      searchAuthors: vi.fn(),
      searchCategories: vi.fn(),
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

    searchService = new SearchService(
      searchRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as ValkeyService,
    );
  });

  describe('search', () => {
    it('should throw BadRequestException when no filters provided', async () => {
      await expect(searchService.search({})).rejects.toThrow('At least one search parameter is required');
    });

    it('should search with query', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(searchRepository.searchStories).mockResolvedValue({
        results: [],
        total: 0,
      });

      const result = await searchService.search({ query: 'test' });

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('total');
      expect(result.query).toBe('test');
      expect(searchRepository.searchStories).toHaveBeenCalledWith({
        query: 'test',
        category: undefined,
        tag: undefined,
        authorId: undefined,
        status: undefined,
        page: 1,
        limit: 20,
        sortBy: 'relevance',
      });
    });

    it('should search with Arabic query', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(searchRepository.searchStories).mockResolvedValue({
        results: [],
        total: 0,
      });

      const result = await searchService.search({ query: 'قصة' });

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('total');
      expect(result.query).toBe('قصة');
      expect(searchRepository.searchStories).toHaveBeenCalledWith({
        query: 'قصة',
        category: undefined,
        tag: undefined,
        authorId: undefined,
        status: undefined,
        page: 1,
        limit: 20,
        sortBy: 'relevance',
      });
    });

    it('should search with mixed Arabic and English query', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(searchRepository.searchStories).mockResolvedValue({
        results: [],
        total: 0,
      });

      const result = await searchService.search({ query: 'story قصة' });

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('total');
      expect(result.query).toBe('story قصة');
      expect(searchRepository.searchStories).toHaveBeenCalledWith({
        query: 'story قصة',
        category: undefined,
        tag: undefined,
        authorId: undefined,
        status: undefined,
        page: 1,
        limit: 20,
        sortBy: 'relevance',
      });
    });

    it('should use cache when available', async () => {
      const cachedResult = {
        results: [],
        total: 0,
        page: 1,
        limit: 20,
        query: 'test',
        took: 0,
      };
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(cachedResult));

      const result = await searchService.search({ query: 'test' });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(searchRepository.searchStories).not.toHaveBeenCalled();
    });

    it('should pass filters to repository', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(searchRepository.searchStories).mockResolvedValue({
        results: [],
        total: 0,
      });

      await searchService.search({
        query: 'test',
        category: 'fiction',
        tag: 'adventure',
        authorId: 'author-123',
        status: 'published',
        page: 2,
        limit: 10,
        sortBy: 'date',
      });

      expect(searchRepository.searchStories).toHaveBeenCalledWith({
        query: 'test',
        category: 'fiction',
        tag: 'adventure',
        authorId: 'author-123',
        status: 'published',
        page: 2,
        limit: 10,
        sortBy: 'date',
      });
    });
  });

  describe('searchAuthors', () => {
    it('should search authors by name', async () => {
      vi.mocked(searchRepository.searchAuthors).mockResolvedValue({
        authors: [],
        total: 0,
      });

      const result = await searchService.searchAuthors('John');

      expect(result).toHaveProperty('authors');
      expect(result).toHaveProperty('total');
      expect(searchRepository.searchAuthors).toHaveBeenCalledWith('John', 1, 20);
    });

    it('should report the page and limit it read rather than dropping them', async () => {
      vi.mocked(searchRepository.searchAuthors).mockResolvedValue({ authors: [], total: 12 });

      const result = await searchService.searchAuthors('John', 3, 5);

      expect(result.page).toBe(3);
      expect(result.limit).toBe(5);
      expect(result.total).toBe(12);
      expect(searchRepository.searchAuthors).toHaveBeenCalledWith('John', 3, 5);
    });
  });

  describe('searchCategories', () => {
    it('should search categories by name', async () => {
      vi.mocked(searchRepository.searchCategories).mockResolvedValue([]);

      const result = await searchService.searchCategories('fiction');

      expect(Array.isArray(result)).toBe(true);
      expect(searchRepository.searchCategories).toHaveBeenCalledWith('fiction');
    });
  });
});
