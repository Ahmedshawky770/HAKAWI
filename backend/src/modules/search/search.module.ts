import { Module } from '@nestjs/common';
import { SearchController } from './search.controller.js';
import { SearchService } from './services/search.service.js';
import { SEARCH_REPOSITORY } from './interfaces/search-repository.interface.js';
import { SearchRepository } from './repositories/search.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    {
      provide: 'CACHE_INTERCEPTOR',
      useClass: CacheInterceptor,
    },
    {
      provide: SEARCH_REPOSITORY,
      useClass: SearchRepository,
    },
  ],
  exports: [SearchService, SEARCH_REPOSITORY],
})
export class SearchModule {}
