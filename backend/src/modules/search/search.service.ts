import { Injectable, Inject, BadRequestException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';

import type { ISearchRepository } from './interfaces/search-repository.interface.ts';
import { SEARCH_REPOSITORY } from './interfaces/search-repository.interface.ts';
import type { SearchResponse, SearchFilters } from './types.ts';

@Injectable()
export class SearchService {
  constructor(
    @Inject(SEARCH_REPOSITORY) private readonly searchRepository: ISearchRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
  ) {}

  async search(filters: SearchFilters): Promise<SearchResponse> {
    const startTime = Date.now();
    const query = filters.query?.trim() || '';
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    if (!query && !filters.category && !filters.tag && !filters.authorId) {
      throw new BadRequestException('At least one search parameter is required');
    }

    const cacheKey = this.buildCacheKey(filters);
    const cached = await this.valkeyService.get(cacheKey);
    if (cached) {
      const result = JSON.parse(cached) as SearchResponse;
      result.took = Date.now() - startTime;
      return result;
    }

    const { results, total } = await this.searchRepository.searchStories({
      query,
      category: filters.category,
      tag: filters.tag,
      authorId: filters.authorId,
      status: filters.status,
      page,
      limit,
      sortBy: filters.sortBy || 'relevance',
    });

    const response: SearchResponse = {
      results: results.map((result) => ({
        ...result,
        highlightedTitle: query ? this.highlightText(result.title, query) : undefined,
        highlightedExcerpt: result.excerpt && query ? this.highlightText(result.excerpt, query) : undefined,
      })),
      total,
      page,
      limit,
      query,
      took: Date.now() - startTime,
    };

    await this.valkeyService.set(cacheKey, JSON.stringify(response), 300);

    this.logger.info(`Search completed: query="${query}", results=${results.length}, took=${response.took}ms`, 'SearchService');

    return response;
  }

  async searchAuthors(query: string, page = 1, limit = 20): Promise<{ authors: { id: string; name: string; storiesCount: number }[]; total: number }> {
    const result = await this.searchRepository.searchAuthors(query, page, limit);
    return {
      authors: result.authors,
      total: result.total,
    };
  }

  async searchCategories(query: string): Promise<{ id: string; name: string; slug: string; storiesCount: number }[]> {
    return this.searchRepository.searchCategories(query);
  }

  private buildCacheKey(filters: SearchFilters): string {
    const parts = ['search'];
    if (filters.query) parts.push(`q:${encodeURIComponent(filters.query)}`);
    if (filters.category) parts.push(`cat:${filters.category}`);
    if (filters.tag) parts.push(`tag:${filters.tag}`);
    if (filters.authorId) parts.push(`author:${filters.authorId}`);
    if (filters.status) parts.push(`status:${filters.status}`);
    parts.push(`page:${filters.page ?? 1}`);
    parts.push(`limit:${filters.limit ?? 20}`);
    return parts.join(':');
  }

  private highlightText(text: string, query: string): string {
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }
}
