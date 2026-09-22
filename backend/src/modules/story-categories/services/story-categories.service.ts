import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import type { IStoryCategoriesRepository, StoryCategory, CreateStoryCategoryData, UpdateStoryCategoryData } from '../interfaces/story-categories-repository.interface.js';
import { STORY_CATEGORIES_REPOSITORY } from '../interfaces/story-categories-repository.interface.js';
import { StoryCategoriesRepository } from '../repositories/story-categories.repository.js';
import { ValkeyService } from '../../../common/services/valkey.service.js';

@Injectable()
export class StoryCategoriesService {
  private readonly logger = new Logger(StoryCategoriesService.name);

  constructor(
    @Inject(STORY_CATEGORIES_REPOSITORY) private readonly categoriesRepository: StoryCategoriesRepository,
    private readonly valkeyService: ValkeyService,
  ) {}

  async findById(id: string): Promise<StoryCategory> {
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Story category not found');
    }
    return category;
  }

  async findAll(): Promise<StoryCategory[]> {
    const cached = await this.valkeyService.get('story-categories:all');
    if (cached) {
      return JSON.parse(cached);
    }
    const result = await this.categoriesRepository.findAll();
    await this.valkeyService.set('story-categories:all', JSON.stringify(result), 3600);
    return result;
  }

  async create(data: CreateStoryCategoryData): Promise<StoryCategory> {
    return this.categoriesRepository.create(data);
  }

  async update(id: string, data: UpdateStoryCategoryData): Promise<StoryCategory> {
    return this.categoriesRepository.update(id, data);
  }
}
