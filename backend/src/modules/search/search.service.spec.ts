import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';

import { SearchService } from './search.service.ts';
import type { ISearchRepository } from './interfaces/search-repository.interface.ts';
import type { SearchResponse } from './types.ts';
import {
  SEARCH_CACHE_NAMESPACE,
  SEARCH_CACHE_TAG,
  SEARCH_CACHE_TTL_SECONDS,
  SEARCH_DEFAULT_SORT,
} from './cache-keys.ts';

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

/**
 * `SearchService` used to take a bare `ValkeyService` and write to an untagged key, which is why
 * nothing could invalidate it. It now takes `TaggedCacheService`, so the mock has to provide
 * `getOrSet` — and `getOrSet` has to actually run `load`, or every test would assert against an
 * undefined value instead of exercising the repository call.
 */
type MockTaggedCacheService = {
  getOrSet: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  invalidateKey: ReturnType<typeof vi.fn>;
  invalidateTags: ReturnType<typeof vi.fn>;
};

describe('SearchService', () => {
  let searchService: SearchService;
  let searchRepository: MockSearchRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: MockValkeyService;
  let cache: MockTaggedCacheService;

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

    // Run `load` on every call, which is the miss path every existing test is written against.
    // `vi.fn()` with no implementation would return undefined and short-circuit the whole suite.
    cache = {
      getOrSet: vi.fn().mockImplementation(async (options: { load: () => Promise<unknown> }) => ({
        value: await options.load(),
      })),
      get: vi.fn(),
      set: vi.fn(),
      invalidateKey: vi.fn(),
      invalidateTags: vi.fn(),
    };

    searchService = new SearchService(
      searchRepository,
      logger as unknown as WinstonLoggerService,
      cache as unknown as TaggedCacheService,
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

    it('should serve a cache hit without touching the repository', async () => {
      // Rewritten for the tagged cache: the hit path is now `getOrSet` declining to call `load`,
      // rather than a `valkeyService.get` returning a JSON string. The assertion that matters is
      // unchanged and is the one this whole block exists for — the repository is not called.
      const cachedResult: SearchResponse = {
        results: [],
        total: 7,
        page: 1,
        limit: 20,
        query: 'test',
        took: 0,
      };
      vi.mocked(cache.getOrSet).mockResolvedValue({ value: cachedResult, hit: true });

      const result = await searchService.search({ query: 'test' });

      expect(result.total).toBe(7);
      expect(searchRepository.searchStories).not.toHaveBeenCalled();
    });

    it('should re-measure `took` on a cache hit, so it reports this request', async () => {
      // A cached `took` describes whichever call filled the cache, which is the same class of lie
      // as a stale `total`: the field is part of the response and would be wrong on every hit.
      vi.mocked(cache.getOrSet).mockResolvedValue({
        value: { results: [], total: 0, page: 1, limit: 20, query: 'test', took: 9999 },
        hit: true,
      });

      const result = await searchService.search({ query: 'test' });

      expect(result.took).not.toBe(9999);
      expect(result.took).toBeGreaterThanOrEqual(0);
    });

    it('should index the cached page under the shared search tag, so a story write can drop it', async () => {
      // The tag is the entire invalidation contract. Asserted here because a typo would still
      // typecheck and would produce a cache that is silently never invalidated.
      vi.mocked(cache.getOrSet).mockImplementation(async (options: { load: () => Promise<unknown> }) => ({
        value: await options.load(),
      }));
      vi.mocked(searchRepository.searchStories).mockResolvedValue({ results: [], total: 0 });

      await searchService.search({ query: 'test' });

      expect(cache.getOrSet).toHaveBeenCalledWith(
        expect.objectContaining({
          namespace: SEARCH_CACHE_NAMESPACE,
          tags: [SEARCH_CACHE_TAG],
          ttl: SEARCH_CACHE_TTL_SECONDS,
        }),
      );
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

  /**
   * The cache key is the whole correctness boundary of a TTL cache: any input the repository can see
   * and any input that changes its output has to be inside it. These assert that through the one
   * observable — the `key` handed to `TaggedCacheService` — rather than against the builder directly,
   * because a unit test that only ever exercised `buildSearchCacheKey` would still pass if the
   * service stopped calling it.
   */
  describe('search cache key', () => {
    const keyFor = async (filters: Parameters<SearchService['search']>[0]): Promise<string> => {
      vi.mocked(searchRepository.searchStories).mockResolvedValue({ results: [], total: 0 });
      vi.mocked(cache.getOrSet).mockClear();
      await searchService.search(filters);
      const options = vi.mocked(cache.getOrSet).mock.calls[0]?.[0] as { key: string };
      return options.key;
    };

    it('should give each sort its own cache entry, so one cannot be served to another', async () => {
      // The defect: `sortBy` was absent from the key, so `?query=x&sortBy=views` and
      // `?query=x&sortBy=date` collided on one entry for its full 300-second TTL and whichever landed
      // first was served to both — a caller asking for the most-read stories was shown the
      // most-recently-published ones, with nothing in the response to say so.
      const byViews = await keyFor({ query: 'x', sortBy: 'views' });
      const byDate = await keyFor({ query: 'x', sortBy: 'date' });
      const byRelevance = await keyFor({ query: 'x', sortBy: 'relevance' });
      const byReactions = await keyFor({ query: 'x', sortBy: 'reactions' });

      expect(new Set([byViews, byDate, byRelevance, byReactions]).size).toBe(4);
    });

    it('should default an omitted sort to the one the repository is asked for', async () => {
      const key = await keyFor({ query: 'x' });

      // Same resolved value for both halves. If the key defaulted independently of the repository
      // call, an omitted sort and an explicit `?sortBy=relevance` would be two entries for one
      // result set — a silent doubling of the index rather than a visible bug.
      expect(key).toBe(await keyFor({ query: 'x', sortBy: SEARCH_DEFAULT_SORT }));
      expect(searchRepository.searchStories).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: SEARCH_DEFAULT_SORT }),
      );
    });

    it('should still separate the sorts that were already in the key', async () => {
      const base = await keyFor({ query: 'x', page: 2, limit: 5, status: 'published' });

      expect(await keyFor({ query: 'y', page: 2, limit: 5, status: 'published' })).not.toBe(base);
      expect(await keyFor({ query: 'x', page: 3, limit: 5, status: 'published' })).not.toBe(base);
      expect(await keyFor({ query: 'x', page: 2, limit: 6, status: 'published' })).not.toBe(base);
      expect(await keyFor({ query: 'x', page: 2, limit: 5, status: 'draft' })).not.toBe(base);
      expect(await keyFor({ query: 'x', page: 2, limit: 5, status: 'published' })).toBe(base);
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
