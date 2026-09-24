import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { CategoriesModule } from '../categories/categories.module.ts';
import { TagsModule } from '../tags/tags.module.ts';

import { StoriesService } from './stories.service.ts';
import { StoriesController } from './controllers/stories.controller.ts';
import { StoriesRepository } from './repositories/stories.repository.ts';
import { StoriesEventHandler } from './events/stories.event-handler.ts';
import { SanitySyncEventHandler } from './sanity/sanity-sync.event-handler.ts';
import { SanityService } from './sanity/sanity.service.ts';
import { STORIES_REPOSITORY } from './interfaces/stories-repository.interface.ts';

@Module({
  imports: [CommonModule, DatabaseModule, CategoriesModule, TagsModule],
  controllers: [StoriesController],
  providers: [
    StoriesService,
    StoriesRepository,
    StoriesEventHandler,
    SanitySyncEventHandler,
    SanityService,
    { provide: STORIES_REPOSITORY, useExisting: StoriesRepository },
  ],
  exports: [StoriesService],
})
export class StoriesModule {}
