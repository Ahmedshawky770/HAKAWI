import { Module } from '@nestjs/common';
import { StoryTagsController } from './story-tags.controller.js';
import { StoryTagsService } from '../story-tags/services/story-tags.service.js';
import { STORY_TAGS_REPOSITORY } from './interfaces/story-tags-repository.interface.js';
import { StoryTagsRepository } from './repositories/story-tags.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [StoryTagsController],
  providers: [
    StoryTagsService,
    {
      provide: 'CACHE_INTERCEPTOR',
      useClass: CacheInterceptor,
    },
    {
      provide: STORY_TAGS_REPOSITORY,
      useClass: StoryTagsRepository,
    },
  ],
  exports: [StoryTagsService, STORY_TAGS_REPOSITORY],
})
export class StoryTagsModule {}
