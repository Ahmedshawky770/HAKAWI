import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller.js';
import { StoriesService } from './services/stories.service.js';
import { STORIES_REPOSITORY } from './interfaces/stories-repository.interface.js';
import { StoriesRepository } from './repositories/stories.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';
import { ValkeyService } from '../../common/services/valkey.service.js';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [StoriesController],
  providers: [
    StoriesService,
    ValkeyService,
    {
      provide: 'CACHE_INTERCEPTOR',
      useClass: CacheInterceptor,
    },
    {
      provide: STORIES_REPOSITORY,
      useClass: StoriesRepository,
    },
  ],
  exports: [StoriesService, STORIES_REPOSITORY],
})
export class StoriesModule {}
