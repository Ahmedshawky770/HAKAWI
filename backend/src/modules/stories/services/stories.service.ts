import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IStoriesRepository, Story, StoryFilters } from '../interfaces/stories-repository.interface.js';
import { STORIES_REPOSITORY } from '../interfaces/stories-repository.interface.js';
import { StoriesRepository } from '../repositories/stories.repository.js';
import type { User } from '../../users/interfaces/users-repository.interface.js';
import { CreateStoryDto, UpdateStoryDto } from '../dto/stories.dto.js';
import { ValkeyService } from '../../../common/services/valkey.service.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const STORY_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
} as const;

export type StoryStatus = (typeof STORY_STATUS)[keyof typeof STORY_STATUS];

@Injectable()
export class StoriesService {
  private readonly logger = new Logger(StoriesService.name);

  constructor(
    @Inject(STORIES_REPOSITORY) private readonly storiesRepository: StoriesRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly valkeyService: ValkeyService,
  ) {}

  async findPublished(filters: StoryFilters): Promise<Story[]> {
    const cacheKey = `stories:published:${JSON.stringify(filters)}`;
    const cached = await this.valkeyService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    const result = await this.storiesRepository.findPublished(filters);
    await this.valkeyService.set(cacheKey, JSON.stringify(result), 300);
    return result;
  }

  async findById(id: string): Promise<Story> {
    const cacheKey = `story:${id}`;
    const cached = await this.valkeyService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    const story = await this.storiesRepository.findById(id);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }
    await this.valkeyService.set(cacheKey, JSON.stringify(story), 600);
    return story;
  }

  async findByAuthorId(authorId: string): Promise<Story[]> {
    return this.storiesRepository.findByAuthorId(authorId);
  }

  async create(authorId: string, data: CreateStoryDto): Promise<Story> {
    const slug = slugify(data.title);
    const wordCount = this.countWords(data.content);
    const readingTime = Math.ceil(wordCount / 200);

    const story = await this.storiesRepository.create({
      ...data,
      authorId,
      slug,
      wordCount,
      readingTime,
      status: STORY_STATUS.DRAFT,
    } as Parameters<typeof this.storiesRepository.create>[0]);

    this.eventEmitter.emit('story.created', { storyId: story.id, authorId, title: story.title, category: story.category });
    return story;
  }

  async update(id: string, authorId: string, data: UpdateStoryDto): Promise<Story> {
    const story = await this.findById(id);
    if (story.authorId !== authorId) {
      throw new BadRequestException('You can only update your own stories');
    }

    const updateData: Record<string, unknown> = { ...data };
    if (data.title && data.title !== story.title) {
      updateData.slug = slugify(data.title);
    }
    if (data.content) {
      updateData.wordCount = this.countWords(data.content);
      updateData.readingTime = Math.ceil(updateData.wordCount as number / 200);
    }

    const updated = await this.storiesRepository.update(id, updateData as Parameters<typeof this.storiesRepository.update>[1]);
    this.eventEmitter.emit('story.updated', { storyId: id, authorId, changes: Object.keys(data) });
    return updated;
  }

  async delete(id: string, authorId: string): Promise<void> {
    const story = await this.findById(id);
    if (story.authorId !== authorId) {
      throw new BadRequestException('You can only delete your own stories');
    }
    await this.storiesRepository.delete(id);
    this.eventEmitter.emit('story.deleted', { storyId: id, authorId });
  }

  async publish(id: string, authorId: string): Promise<Story> {
    const story = await this.findById(id);
    if (story.authorId !== authorId) {
      throw new BadRequestException('You can only publish your own stories');
    }
    if (story.status !== STORY_STATUS.DRAFT) {
      throw new BadRequestException('Only draft stories can be published');
    }

    const updated = await this.storiesRepository.update(id, { status: STORY_STATUS.PENDING, publishedAt: new Date() });
    this.eventEmitter.emit('story.published', { storyId: id, authorId, title: story.title, slug: story.slug, category: story.category, tags: story.tags, publishedAt: updated.publishedAt });
    return updated;
  }

  async approve(id: string): Promise<Story> {
    const story = await this.findById(id);
    if (story.status !== STORY_STATUS.PENDING) {
      throw new BadRequestException('Only pending stories can be approved');
    }
    return this.storiesRepository.update(id, { status: STORY_STATUS.PUBLISHED });
  }

  async reject(id: string, reason: string): Promise<Story> {
    const story = await this.findById(id);
    if (story.status !== STORY_STATUS.PENDING) {
      throw new BadRequestException('Only pending stories can be rejected');
    }
    return this.storiesRepository.update(id, { status: STORY_STATUS.REJECTED });
  }

  async incrementViews(id: string): Promise<void> {
    await this.storiesRepository.incrementViews(id);
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }
}
