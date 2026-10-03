import { Controller, Get, Query, Inject, BadRequestException } from '@nestjs/common';

import { Public } from '../../common/decorators/roles.decorator.ts';
import { ThrottleTier } from '../../common/decorators/throttle-tier.decorator.ts';

import { SearchService } from './search.service.ts';
import { SearchAuthorsQueryDto, SearchFiltersDto } from './dto/search.dto.ts';
import type { SearchFilters } from './types.ts';

@ThrottleTier('search')
@Controller('search')
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

  /**
   * The public search index.
   *
   * WHY `status` IS OVERRIDDEN RATHER THAN TRUSTED. This route is `@Public()`, and the repository
   * forwards `filters.status` straight into `WHERE status = $1`. That made `?status=draft` an
   * anonymous dump of every unpublished story in the system, and `?status=archived` of every
   * withdrawn one. `status` stays on the DTO because it is part of the cache key and the service
   * contract, but a public search is by definition an index of published content, so the value is
   * pinned here instead of read from the query string.
   *
   * A caller that legitimately wants its own drafts has `GET /stories`, which is authenticated and
   * already scoped by `OwnershipGuard` on the write side and by `authorId` on the read side.
   */
  @Public()
  @Get()
  async search(@Query() query: SearchFiltersDto) {
    return this.searchService.search({ ...(query as SearchFilters), status: 'published' });
  }

  /**
   * `limit` and `page` arrive as strings and were passed through as `Number(x) || n`, which accepts
   * `999999999` and hands it to `LIMIT`. A DTO bounds them the same way the rest of the codebase
   * does (`SearchFiltersDto.limit` is `@Max(100)`), so a public endpoint cannot be asked for an
   * unbounded page of a table it is already throttled on but not limited by.
   */
  @Public()
  @Get('authors')
  async searchAuthors(@Query() query: SearchAuthorsQueryDto) {
    return this.searchService.searchAuthors(query.q, query.page ?? 1, query.limit ?? 20);
  }

  @Public()
  @Get('categories')
  async searchCategories(@Query('q') q: string) {
    if (!q) {
      throw new BadRequestException('Query parameter "q" is required');
    }
    return this.searchService.searchCategories(q);
  }
}
