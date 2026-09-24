import { Injectable, NotFoundException, ConflictException, ForbiddenException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import type { StoryCreatedEvent, StoryUpdatedEvent, StoryPublishedEvent, StoryArchivedEvent, StoryDeletedEvent } from '../../common/events/stories.events.ts';

import type { IStoriesRepository } from './interfaces/stories-repository.interface.ts';
import { STORIES_REPOSITORY } from './interfaces/stories-repository.interface.ts';
import type { Story, CreateStoryInput, UpdateStoryInput, StoryResponse, StoriesListResponse } from './types.ts';


@Injectable()
export class StoriesService {
  constructor(
    @Inject(STORIES_REPOSITORY) private readonly storiesRepository: IStoriesRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async create(authorId: string, input: CreateStoryInput): Promise<Story> {
    const slug = input.slug.trim();
    const existing = await this.storiesRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictException('Story slug already exists');
    }

    const data: CreateStoryInput = {
      ...input,
      authorId,
      status: 'draft',
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
    };

    const story = await this.storiesRepository.create(data);
    await this.eventBus.emit('story.created', { storyId: story.id, authorId } as StoryCreatedEvent);
    return story;
  }

  async findById(id: string): Promise<Story> {
    const cached = await this.valkeyService.get(`story:${id}`);
    if (cached) {
      return JSON.parse(cached) as Story;
    }

    const story = await this.storiesRepository.findById(id);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    await this.valkeyService.set(`story:${id}`, JSON.stringify(story), 600);
    return story;
  }

  async findBySlug(slug: string): Promise<Story> {
    const cached = await this.valkeyService.get(`story:slug:${slug}`);
    if (cached) {
      return JSON.parse(cached) as Story;
    }

    const story = await this.storiesRepository.findBySlug(slug);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    await this.valkeyService.set(`story:slug:${slug}`, JSON.stringify(story), 600);
    return story;
  }

  async findAll(params: { page?: number; limit?: number; authorId?: string; categoryId?: string; status?: string; search?: string }): Promise<StoriesListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const result = await this.storiesRepository.findAll(params);
    const stories = result.stories.map((story) => this.toStoryResponse(story));

    return {
      stories,
      total: result.total,
      page,
      limit,
    };
  }

  async update(id: string, input: UpdateStoryInput): Promise<Story> {
    const existing = await this.storiesRepository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    if (input.slug && input.slug !== existing.slug) {
      const slugExists = await this.storiesRepository.findBySlug(input.slug);
      if (slugExists) {
        throw new ConflictException('Story slug already exists');
      }
    }

    const story = await this.storiesRepository.update(id, input);
    await this.valkeyService.del(`story:${id}`);
    await this.valkeyService.del(`story:slug:${existing.slug}`);

    await this.eventBus.emit('story.updated', { storyId: id, updatedFields: input } as StoryUpdatedEvent);
    return story;
  }

  async publish(id: string): Promise<Story> {
    const story = await this.storiesRepository.findById(id);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    if (story.status === 'published') {
      throw new ForbiddenException('Story is already published');
    }

    if (story.status === 'archived') {
      throw new ForbiddenException('Cannot publish an archived story');
    }

    const publishedAt = new Date();
    const updated = await this.storiesRepository.update(id, {
      status: 'published',
      publishedAt,
    });

    await this.eventBus.emit('story.published', { storyId: id, publishedAt } as StoryPublishedEvent);
    return updated;
  }

  async archive(id: string): Promise<Story> {
    const story = await this.storiesRepository.findById(id);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    if (story.status === 'archived') {
      throw new ForbiddenException('Story is already archived');
    }

    const updated = await this.storiesRepository.update(id, { status: 'archived' });
    await this.valkeyService.del(`story:${id}`);

    await this.eventBus.emit('story.archived', { storyId: id } as StoryArchivedEvent);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const story = await this.storiesRepository.findById(id);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    await this.storiesRepository.softDelete(id);
    await this.valkeyService.del(`story:${id}`);
    await this.valkeyService.del(`story:slug:${story.slug}`);

    await this.eventBus.emit('story.deleted', { storyId: id, authorId: story.authorId } as StoryDeletedEvent);
  }

  async incrementViewCount(id: string): Promise<void> {
    const story = await this.storiesRepository.findById(id);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    await this.storiesRepository.incrementViewCount(id);
  }

  private toStoryResponse(story: Story): StoryResponse {
    return {
      id: story.id,
      title: story.title,
      slug: story.slug,
      excerpt: story.excerpt,
      content: story.content,
      coverImage: story.coverImage,
      status: story.status,
      category: null,
      tags: [],
      views: story.viewCount,
      reactions: story.likeCount,
      author: { id: story.authorId, name: '' },
      createdAt: story.createdAt.toISOString(),
      updatedAt: story.updatedAt.toISOString(),
    };
  }
}
