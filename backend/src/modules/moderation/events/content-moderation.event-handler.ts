import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  StoryCreatedEvent,
  StoryUpdatedEvent,
  StoryPublishedEvent,
} from '../../../common/events/stories.events.ts';
import type { CommentCreatedEvent, CommentUpdatedEvent } from '../../../common/events/social.events.ts';

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

  /**
   * WHY THE UPDATE EVENTS ARE MODERATED TOO.
   *
   * Only `story.created`, `story.published` and `comment.created` were subscribed, so the obvious
   * bypass was available to anyone: publish something clean, then PATCH the prohibited text in. The
   * stored content is then the violating version and nothing has ever looked at it — the moderation
   * pass ran against the clean text at publish time and never again.
   *
   * WHY THIS DOES NOT GENERATE A REPORT PER EDIT. `ContentModerationService.fileReport` de-duplicates
   * on (target, reason) inside `AUTO_REPORT_DEDUPE_WINDOW_MS`, so an author editing a story that
   * already tripped a rule produces one report and then nothing further. Without that guard this
   * change would have turned every keystroke-triggered save into a moderation queue item.
   */
  @OnEvent('story.updated')
  async handleStoryUpdated(event: StoryUpdatedEvent): Promise<void> {
    await this.safely('story.updated', event.storyId, () => this.contentModeration.reviewStory(event.storyId));
  }

  @OnEvent('comment.updated')
  async handleCommentUpdated(event: CommentUpdatedEvent): Promise<void> {
    await this.safely('comment.updated', event.commentId, () => this.contentModeration.reviewComment(event.commentId));
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
