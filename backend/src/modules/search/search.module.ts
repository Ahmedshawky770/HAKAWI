import { Module } from '@nestjs/common';

import { ValkeyService } from '../../common/services/valkey.service.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { StoriesModule } from '../stories/stories.module.ts';
import { CategoriesModule } from '../categories/categories.module.ts';
import { TagsModule } from '../tags/tags.module.ts';

import { SearchService } from './search.service.ts';
import { SearchController } from './search.controller.ts';
import { SearchRepository } from './repositories/search.repository.ts';
import { SEARCH_REPOSITORY } from './interfaces/search-repository.interface.ts';

@Module({
  imports: [DatabaseModule, StoriesModule, CategoriesModule, TagsModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchRepository,
    ValkeyService,
    { provide: SEARCH_REPOSITORY, useExisting: SearchRepository },
  ],
  exports: [SearchService],
})
export class SearchModule {}
