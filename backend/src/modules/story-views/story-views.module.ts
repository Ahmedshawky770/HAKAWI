import { Module } from '@nestjs/common';
import { StoryViewsController } from './story-views.controller.js';
import { StoryViewsService } from './services/story-views.service.js';
import { STORY_VIEWS_REPOSITORY } from './interfaces/story-views-repository.interface.js';
import { StoryViewsRepository } from './repositories/story-views.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [StoryViewsController],
  providers: [
    StoryViewsService,
    {
      provide: STORY_VIEWS_REPOSITORY,
      useClass: StoryViewsRepository,
    },
  ],
  exports: [StoryViewsService, STORY_VIEWS_REPOSITORY],
})
export class StoryViewsModule {}
