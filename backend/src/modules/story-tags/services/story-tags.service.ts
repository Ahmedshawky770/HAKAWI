import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import type { IStoryTagsRepository, StoryTag, CreateStoryTagData } from '../interfaces/story-tags-repository.interface.js';
import { STORY_TAGS_REPOSITORY } from '../interfaces/story-tags-repository.interface.js';
import { StoryTagsRepository } from '../repositories/story-tags.repository.js';
import { ValkeyService } from '../../../common/services/valkey.service.js';

@Injectable()
export class StoryTagsService {
  private readonly logger = new Logger(StoryTagsService.name);

  constructor(
    @Inject(STORY_TAGS_REPOSITORY) private readonly tagsRepository: StoryTagsRepository,
    private readonly valkeyService: ValkeyService,
  ) {}

  async findById(id: string): Promise<StoryTag> {
    const tag = await this.tagsRepository.findById(id);
    if (!tag) {
      throw new NotFoundException('Story tag not found');
    }
    return tag;
  }

  async findAll(): Promise<StoryTag[]> {
    const cached = await this.valkeyService.get('story-tags:all');
    if (cached) {
      return JSON.parse(cached);
    }
    const result = await this.tagsRepository.findAll();
    await this.valkeyService.set('story-tags:all', JSON.stringify(result), 3600);
    return result;
  }

  async create(data: CreateStoryTagData): Promise<StoryTag> {
    return this.tagsRepository.create(data);
  }
}
