import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { StoryCreatedEvent, StoryPublishedEvent } from '../../../common/events/stories.events.ts';
import type { CommentCreatedEvent } from '../../../common/events/social.events.ts';

import { ContentModerationService } from '../content-moderation/content-moderation.service.ts';

/**
 * The moderation hooks the roadmap asks for, wired as event subscribers so the
 * stories and comments modules never import moderation (Principle #7).
 */
@Injectable()
export class ContentModerationEventHandler {
  constructor(
    @Inject(ContentModerationService) private readonly contentModeration: ContentModerationService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('story.created')
  async handleStoryCreated(event: StoryCreatedEvent): Promise<void> {
    await this.safely('story.created', event.storyId, () => this.contentModeration.reviewStory(event.storyId));
  }

  @OnEvent('story.published')
  async handleStoryPublished(event: StoryPublishedEvent): Promise<void> {
    await this.safely('story.published', event.storyId, () => this.contentModeration.reviewStory(event.storyId));
  }

  @OnEvent('comment.created')
  async handleCommentCreated(event: CommentCreatedEvent): Promise<void> {
    await this.safely('comment.created', event.commentId, () => this.contentModeration.reviewComment(event.commentId));
  }

  private async safely(eventName: string, subjectId: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(
        `Content moderation failed for ${eventName} ${subjectId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        undefined,
        'ContentModerationEventHandler',
      );
    }
  }
}
