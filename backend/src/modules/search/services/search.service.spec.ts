import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchService } from './search.service.js';
import type { SearchRepository } from '../repositories/search.repository.js';
import { ValkeyService } from '../../../common/services/valkey.service.js';

type MockSearchRepository = Partial<SearchRepository>;
type MockValkeyService = Partial<ValkeyService>;

const createMockStory = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'story-123',
  authorId: 'user-123',
  title: 'Test Story',
  slug: 'test-story',
  description: 'Test description',
  status: 'published',
  wordCount: 100,
  readingTime: 1,
  views: 0,
  reactions: 0,
  comments: 0,
  category: 'fiction',
  tags: ['tag1'],
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockUser = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  accountType: 'reader',
  isVerified: false,
  ...overrides,
});

const createMockCategory = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'category-123',
  name: 'Fiction',
  slug: 'fiction',
  description: 'Fiction stories',
  ...overrides,
});

describe('SearchService', () => {
  let searchService: SearchService;
  let searchRepository: MockSearchRepository;
  let valkeyService: MockValkeyService;

  beforeEach(() => {
    searchRepository = {
      searchStories: vi.fn(),
      searchUsers: vi.fn(),
      searchCategories: vi.fn(),
      getSuggestions: vi.fn(),
    };

    valkeyService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
    };

    searchService = new SearchService(
      searchRepository as SearchRepository,
      valkeyService as ValkeyService,
    );
  });

  describe('searchStories', () => {
    it('should return cached results when available', async () => {
      const cachedResult = { items: [createMockStory()], total: 1, page: 1, limit: 10, totalPages: 1 };
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(cachedResult));

      const result = await searchService.searchStories('test', {}, 1, 10);

      expect(result).toEqual(JSON.parse(JSON.stringify(cachedResult)));
      expect(searchRepository.searchStories).not.toHaveBeenCalled();
    });

    it('should fetch from repository and cache when not cached', async () => {
      const result = { items: [createMockStory()], total: 1, page: 1, limit: 10, totalPages: 1 };
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(searchRepository.searchStories).mockResolvedValue(result as any);

      const searchResult = await searchService.searchStories('test', {}, 1, 10);

      expect(searchResult).toEqual(result);
      expect(valkeyService.set).toHaveBeenCalledWith(
        expect.stringContaining('search:stories:test'),
        JSON.stringify(result),
        60,
      );
    });
  });

  describe('searchUsers', () => {
    it('should return user search results', async () => {
      const result = { items: [createMockUser()], total: 1, page: 1, limit: 10, totalPages: 1 };
      vi.mocked(searchRepository.searchUsers).mockResolvedValue(result as any);

      const searchResult = await searchService.searchUsers('test', 1, 10);

      expect(searchResult).toEqual(result);
    });
  });

  describe('searchCategories', () => {
    it('should return category search results', async () => {
      const result = { items: [createMockCategory()], total: 1, page: 1, limit: 10, totalPages: 1 };
      vi.mocked(searchRepository.searchCategories).mockResolvedValue(result as any);

      const searchResult = await searchService.searchCategories('fiction', 1, 10);

      expect(searchResult).toEqual(result);
    });
  });

  describe('getSuggestions', () => {
    it('should return search suggestions', async () => {
      const suggestions = ['test1', 'test2', 'test3'];
      vi.mocked(searchRepository.getSuggestions).mockResolvedValue(suggestions);

      const result = await searchService.getSuggestions('test', 5);

      expect(result).toEqual(suggestions);
    });
  });
});
