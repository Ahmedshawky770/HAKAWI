import { Injectable, Inject, BadRequestException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';

import type { ISearchRepository } from './interfaces/search-repository.interface.ts';
import { SEARCH_REPOSITORY } from './interfaces/search-repository.interface.ts';
import type { SearchResponse, SearchFilters } from './types.ts';
import {
  SEARCH_CACHE_NAMESPACE,
  SEARCH_CACHE_TAG,
  SEARCH_CACHE_TTL_SECONDS,
  SEARCH_DEFAULT_SORT,
  buildSearchCacheKey,
} from './cache-keys.ts';

@Injectable()
export class SearchService {
  constructor(
    @Inject(SEARCH_REPOSITORY) private readonly searchRepository: ISearchRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(TaggedCacheService) private readonly cache: TaggedCacheService,
  ) {}

  async search(filters: SearchFilters): Promise<SearchResponse> {
    const startTime = Date.now();
    const query = filters.query?.trim() || '';
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    if (!query && !filters.category && !filters.tag && !filters.authorId) {
      throw new BadRequestException('At least one search parameter is required');
    }

    // Resolved BEFORE the cache key is built, so the sort that identifies this page in the cache is
    // the same sort the repository is asked for. Resolving it inside the loader instead would make
    // the key depend on a value the key itself does not carry.
    const sortBy = filters.sortBy ?? SEARCH_DEFAULT_SORT;

    const { value } = await this.cache.getOrSet<SearchResponse>({
      namespace: SEARCH_CACHE_NAMESPACE,
      key: buildSearchCacheKey({ ...filters, query, sortBy }),
      ttl: SEARCH_CACHE_TTL_SECONDS,
      tags: [SEARCH_CACHE_TAG],
      load: async () => {
        const { results, total } = await this.searchRepository.searchStories({
          query,
          category: filters.category,
          tag: filters.tag,
          authorId: filters.authorId,
          status: filters.status,
          page,
          limit,
          sortBy,
        });

        this.logger.info(
          `Search completed: query="${query}", results=${results.length}, total=${total}`,
          'SearchService',
        );

        return {
          results: results.map((result) => ({
            ...result,
            highlightedTitle: query ? this.highlightText(result.title, query) : undefined,
            highlightedExcerpt: result.excerpt && query ? this.highlightText(result.excerpt, query) : undefined,
          })),
          total,
          page,
          limit,
          query,
          // Overwritten below with the real elapsed time; stored so the cached shape matches the
          // fresh one and a cache hit does not change the response's type.
          took: 0,
        };
      },
    });

    // `took` is measured on every call, including a cache hit, so the field reports this request's
    // latency rather than the latency of whichever call happened to fill the cache.
    return { ...value, took: Date.now() - startTime };
  }

  async searchAuthors(
    query: string,
    page = 1,
    limit = 20,
  ): Promise<{
    authors: { id: string; name: string; storiesCount: number }[];
    total: number;
    page: number;
    limit: number;
  }> {
    const result = await this.searchRepository.searchAuthors(query, page, limit);
    return {
      authors: result.authors,
      total: result.total,
      page,
      limit,
    };
  }

  async searchCategories(query: string): Promise<{ id: string; name: string; slug: string; storiesCount: number }[]> {
    return this.searchRepository.searchCategories(query);
  }

  private highlightText(text: string, query: string): string {
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
  }
}
