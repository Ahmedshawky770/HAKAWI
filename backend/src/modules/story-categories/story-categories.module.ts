import { Module } from '@nestjs/common';
import { StoryCategoriesController } from './story-categories.controller.js';
import { StoryCategoriesService } from '../story-categories/services/story-categories.service.js';
import { STORY_CATEGORIES_REPOSITORY } from './interfaces/story-categories-repository.interface.js';
import { StoryCategoriesRepository } from './repositories/story-categories.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [StoryCategoriesController],
  providers: [
    StoryCategoriesService,
    {
      provide: 'CACHE_INTERCEPTOR',
      useClass: CacheInterceptor,
    },
    {
      provide: STORY_CATEGORIES_REPOSITORY,
      useClass: StoryCategoriesRepository,
    },
  ],
  exports: [StoryCategoriesService, STORY_CATEGORIES_REPOSITORY],
})
export class StoryCategoriesModule {}
