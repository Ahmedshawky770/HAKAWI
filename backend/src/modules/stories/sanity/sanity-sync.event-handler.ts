import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  StoryCreatedEvent,
  StoryUpdatedEvent,
  StoryPublishedEvent,
  StoryArchivedEvent,
  StoryDeletedEvent,
  StorySnapshot,
} from '../../../common/events/stories.events.ts';

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

  /**
   * Accepts the event's snapshot rather than the `Story` row type.
   *
   * The two are structurally identical for the fields a Sanity document needs, and going through
   * the event's own type is what makes the contract checkable: a field added to the snapshot schema
   * without being handled here becomes a type error, whereas a `Story` parameter would let the
   * two drift apart silently — which is what happened, since the handler read a field the events
   * never carried.
   *
   * `publishedAt` is defensively coerced. An in-process emit passes a real `Date`, but a payload
   * replayed from the dead-letter queue has been through JSON and arrives as a string, and
   * `.toISOString()` on a string is a `TypeError`.
   */
  private toSanityDocument(story: StorySnapshot): SanityStoryDocument {
    const publishedAt =
      story.publishedAt instanceof Date ? story.publishedAt : story.publishedAt ? new Date(story.publishedAt) : null;

    return {
      _id: `story-${story.id}`,
      _type: 'story',
      title: story.title,
      slug: story.slug,
      excerpt: story.excerpt ?? undefined,
      content: story.content ?? undefined,
      coverImage: story.coverImage ?? undefined,
      status: story.status,
      publishedAt: publishedAt?.toISOString() ?? undefined,
      authorId: story.authorId,
      hakawiId: story.id,
    };
  }

  @OnEvent('story.created')
  async handleStoryCreated(event: StoryCreatedEvent): Promise<void> {
    if (!this.sanityService.isEnabled()) return;
    const { story } = event;
    // Still guarded, and still worth it: `story` is optional in the schema so that a dead-lettered
    // payload from before this field existed can still be replayed, and a replay must not throw.
    if (!story) {
      this.logger.warn(
        `story.created ${event.storyId} carried no story snapshot; Sanity sync skipped`,
        'SanitySyncEventHandler',
      );
      return;
    }
    await this.sanityService.syncStoryToSanity(this.toSanityDocument(story));
  }

  @OnEvent('story.updated')
  async handleStoryUpdated(event: StoryUpdatedEvent): Promise<void> {
    if (!this.sanityService.isEnabled()) return;
    const { story } = event;
    if (!story) {
      this.logger.warn(
        `story.updated ${event.storyId} carried no story snapshot; Sanity sync skipped`,
        'SanitySyncEventHandler',
      );
      return;
    }
    await this.sanityService.syncStoryToSanity(this.toSanityDocument(story));
  }

  @OnEvent('story.published')
  async handleStoryPublished(event: StoryPublishedEvent): Promise<void> {
    if (!this.sanityService.isEnabled()) return;
    const { story } = event;
    if (!story) {
      this.logger.warn(
        `story.published ${event.storyId} carried no story snapshot; Sanity sync skipped`,
        'SanitySyncEventHandler',
      );
      return;
    }
    await this.sanityService.syncStoryToSanity(this.toSanityDocument(story));
  }

  @OnEvent('story.archived')
  async handleStoryArchived(event: StoryArchivedEvent): Promise<void> {
    if (!this.sanityService.isEnabled()) return;
    const { story } = event;
    if (!story) {
      this.logger.warn(
        `story.archived ${event.storyId} carried no story snapshot; Sanity sync skipped`,
        'SanitySyncEventHandler',
      );
      return;
    }
    // Archiving pushes the document with `status: 'archived'` rather than deleting it, so the
    // editorial team keeps the record. Only a hard delete removes the document, and that is what
    // `story.deleted` below does.
    await this.sanityService.syncStoryToSanity(this.toSanityDocument(story));
  }

  @OnEvent('story.deleted')
  async handleStoryDeleted(event: StoryDeletedEvent): Promise<void> {
    if (!this.sanityService.isEnabled()) return;
    await this.sanityService.deleteStoryFromSanity(event.storyId);
  }
}
