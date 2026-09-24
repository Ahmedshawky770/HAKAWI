import { Controller, Get, Query, Inject, BadRequestException } from '@nestjs/common';

import { Public } from '../../common/decorators/roles.decorator.ts';

import { SearchService } from './search.service.ts';
import type { SearchFilters } from './types.ts';

@Controller('search')
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

  @Public()
  @Get()
  async search(@Query() query: SearchFilters) {
    return this.searchService.search(query);
  }

  @Public()
  @Get('authors')
  async searchAuthors(@Query('q') q: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    if (!q) {
      throw new BadRequestException('Query parameter "q" is required');
    }
    return this.searchService.searchAuthors(q, Number(page) || 1, Number(limit) || 20);
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
