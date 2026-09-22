import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { SearchService } from './services/search.service.js';
import { SearchQueryDto } from './dto/search.dto.js';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query() query: SearchQueryDto) {
    return this.searchService.searchStories(query.q, {}, query.page ?? 1, query.limit ?? 20);
  }

  @Get('stories')
  async searchStories(@Query() query: SearchQueryDto) {
    return this.searchService.searchStories(query.q, {}, query.page ?? 1, query.limit ?? 20);
  }

  @Get('authors')
  async searchAuthors(@Query() query: SearchQueryDto) {
    return this.searchService.searchUsers(query.q, query.page ?? 1, query.limit ?? 20);
  }

  @Get('categories')
  async searchCategories(@Query() query: SearchQueryDto) {
    return this.searchService.searchCategories(query.q, query.page ?? 1, query.limit ?? 20);
  }
}
