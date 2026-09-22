import { Injectable, Logger, Inject } from '@nestjs/common';
import type { IStoryViewsRepository, StoryView, CreateStoryViewData } from '../interfaces/story-views-repository.interface.js';
import { STORY_VIEWS_REPOSITORY } from '../interfaces/story-views-repository.interface.js';
import { StoryViewsRepository } from '../repositories/story-views.repository.js';

@Injectable()
export class StoryViewsService {
  private readonly logger = new Logger(StoryViewsService.name);

  constructor(
    @Inject(STORY_VIEWS_REPOSITORY) private readonly viewsRepository: StoryViewsRepository,
  ) {}

  async create(data: CreateStoryViewData): Promise<StoryView> {
    return this.viewsRepository.create(data);
  }

  async findByStoryId(storyId: string): Promise<StoryView[]> {
    return this.viewsRepository.findByStoryId(storyId);
  }

  async findByViewerId(viewerId: string): Promise<StoryView[]> {
    return this.viewsRepository.findByViewerId(viewerId);
  }

  async countByStoryId(storyId: string): Promise<number> {
    return this.viewsRepository.countByStoryId(storyId);
  }
}
