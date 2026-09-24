import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { StoryCreatedEvent, StoryUpdatedEvent, StoryPublishedEvent, StoryDeletedEvent } from '../../../common/events/stories.events.ts';
import type { Story } from '../types.ts';

import { SanityService } from './sanity.service.ts';
import type { SanityStoryDocument } from './sanity.types.ts';

@Injectable()
export class SanitySyncEventHandler {
  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(SanityService) private readonly sanityService: SanityService,
  ) {
    if (this.sanityService.isEnabled()) {
      this.logger.info('Sanity sync enabled', 'SanitySyncEventHandler');
    } else {
      this.logger.warn('Sanity not configured. Sanity sync disabled.', 'SanitySyncEventHandler');
    }
  }

  private toSanityDocument(story: Story): SanityStoryDocument {
    return {
      _id: `story-${story.id}`,
      _type: 'story',
      title: story.title,
      slug: story.slug,
      excerpt: story.excerpt ?? undefined,
      content: story.content ?? undefined,
      coverImage: story.coverImage ?? undefined,
      status: story.status,
      publishedAt: story.publishedAt?.toISOString() ?? undefined,
      authorId: story.authorId,
      hakawiId: story.id,
    };
  }

  @OnEvent('story.created')
  async handleStoryCreated(event: StoryCreatedEvent & { story?: Story }): Promise<void> {
    if (!this.sanityService.isEnabled()) return;
    const story = event.story;
    if (!story) return;
    await this.sanityService.syncStoryToSanity(this.toSanityDocument(story));
  }

  @OnEvent('story.updated')
  async handleStoryUpdated(event: StoryUpdatedEvent & { story?: Story }): Promise<void> {
    if (!this.sanityService.isEnabled()) return;
    const story = event.story;
    if (!story) return;
    await this.sanityService.syncStoryToSanity(this.toSanityDocument(story));
  }

  @OnEvent('story.published')
  async handleStoryPublished(event: StoryPublishedEvent & { story?: Story }): Promise<void> {
    if (!this.sanityService.isEnabled()) return;
    const story = event.story;
    if (!story) return;
    await this.sanityService.syncStoryToSanity(this.toSanityDocument(story));
  }

  @OnEvent('story.deleted')
  async handleStoryDeleted(event: StoryDeletedEvent): Promise<void> {
    if (!this.sanityService.isEnabled()) return;
    await this.sanityService.deleteStoryFromSanity(event.storyId);
  }
}
