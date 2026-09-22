import { Module } from '@nestjs/common';
import { StoriesService } from './services/stories.service.js';
import { StoriesController } from './controllers/stories.controller.js';
import { StoriesRepository } from './repositories/stories.repository.js';

@Module({
  imports: [],
  controllers: [StoriesController],
  providers: [StoriesService, StoriesRepository],
  exports: [StoriesService],
})
export class StoriesModule {}
