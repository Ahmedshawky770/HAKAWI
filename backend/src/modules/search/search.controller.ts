import { Controller, Get, Query, Inject, BadRequestException } from '@nestjs/common';

import { Public } from '../../common/decorators/roles.decorator.ts';
import { ThrottleTier } from '../../common/decorators/throttle-tier.decorator.ts';
import { PUBLIC_STORY_STATUS } from '../stories/types.ts';

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
   * The same rule is applied by `StoriesController.findAll`, and both routes read it from the one
   * `PUBLIC_STORY_STATUS` constant rather than each spelling the literal. That matters because the
   * two routes used to DISAGREE: this one was pinned while `GET /stories` was not, and `GET /stories`
   * is `@Public()` too — the comment here used to justify the pin by claiming that route "is
   * authenticated and already scoped by `authorId`", which was never true of either claim. A comment
   * asserting a security property that the code does not have is worse than no comment, because it
   * is read as the reason nobody else checked.
   *
   * The privileged counterpart is still missing rather than provided here: an author cannot list
   * their own drafts over HTTP. See the gap note on `StoriesController.findAll`.
   */
  @Public()
  @Get()
  async search(@Query() query: SearchFiltersDto) {
    return this.searchService.search({ ...(query as SearchFilters), status: PUBLIC_STORY_STATUS });
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
