import { Module } from '@nestjs/common';
import { StoryCategoriesService } from './services/story-categories.service.js';
import { StoryCategoriesController } from './controllers/story-categories.controller.js';
import { StoryCategoriesRepository } from './repositories/story-categories.repository.js';

@Module({
  imports: [],
  controllers: [StoryCategoriesController],
  providers: [StoryCategoriesService, StoryCategoriesRepository],
  exports: [StoryCategoriesService],
})
export class StoryCategoriesModule {}
