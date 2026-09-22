import { Module } from '@nestjs/common';
import { StoryTagsService } from './services/story-tags.service.js';
import { StoryTagsController } from './controllers/story-tags.controller.js';
import { StoryTagsRepository } from './repositories/story-tags.repository.js';

@Module({
  imports: [],
  controllers: [StoryTagsController],
  providers: [StoryTagsService, StoryTagsRepository],
  exports: [StoryTagsService],
})
export class StoryTagsModule {}
