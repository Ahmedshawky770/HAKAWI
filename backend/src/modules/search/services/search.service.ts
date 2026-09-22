import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ISearchRepository, SearchResult, SearchFilters, Story, User, StoryCategory } from '../interfaces/search-repository.interface.js';
import { SEARCH_REPOSITORY } from '../interfaces/search-repository.interface.js';
import { SearchRepository } from '../repositories/search.repository.js';
import { ValkeyService } from '../../../common/services/valkey.service.js';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(SEARCH_REPOSITORY) private readonly searchRepository: SearchRepository,
    private readonly valkeyService: ValkeyService,
  ) {}

  async searchStories(query: string, filters: SearchFilters, page: number, limit: number): Promise<SearchResult<Story>> {
    const cacheKey = `search:stories:${query}:${JSON.stringify(filters)}:${page}:${limit}`;
    const cached = await this.valkeyService.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for search: ${query}`);
      return JSON.parse(cached);
    }
    this.logger.debug(`Searching stories: ${query}`);
    const result = await this.searchRepository.searchStories(query, filters, page, limit);
    await this.valkeyService.set(cacheKey, JSON.stringify(result), 60);
    return result;
  }

  async searchUsers(query: string, page: number, limit: number): Promise<SearchResult<User>> {
    this.logger.debug(`Searching users: ${query}`);
    return this.searchRepository.searchUsers(query, page, limit);
  }

  async searchCategories(query: string, page: number, limit: number): Promise<SearchResult<StoryCategory>> {
    this.logger.debug(`Searching categories: ${query}`);
    return this.searchRepository.searchCategories(query, page, limit);
  }

  async getSuggestions(query: string, limit: number): Promise<string[]> {
    this.logger.debug(`Getting suggestions: ${query}`);
    return this.searchRepository.getSuggestions(query, limit);
  }
}
