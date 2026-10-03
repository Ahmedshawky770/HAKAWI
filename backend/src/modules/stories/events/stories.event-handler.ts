import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  StoryCreatedEvent,
  StoryUpdatedEvent,
  StoryPublishedEvent,
  StoryArchivedEvent,
  StoryDeletedEvent,
} from '../../../common/events/stories.events.ts';
import type { IStoriesRepository } from '../interfaces/stories-repository.interface.ts';
import { STORIES_REPOSITORY } from '../interfaces/stories-repository.interface.ts';
import { TaggedCacheService } from '../../shared/cache/tagged-cache.service.ts';
import { STORY_CACHE_NAMESPACE, STORIES_CACHE_TAG } from '../stories.service.ts';

@Injectable()
export class StoriesEventHandler {
  constructor(
    @Inject(STORIES_REPOSITORY) private readonly storiesRepository: IStoriesRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(TaggedCacheService) private readonly cache: TaggedCacheService,
  ) {}

  @OnEvent('story.created')
  async handleStoryCreated(event: StoryCreatedEvent): Promise<void> {
    this.logger.info(`Handling story created event: ${event.storyId}`, 'StoriesEventHandler');
  }

  @OnEvent('story.updated')
  async handleStoryUpdated(event: StoryUpdatedEvent): Promise<void> {
    this.logger.info(`Handling story updated event: ${event.storyId}`, 'StoriesEventHandler');
  }

  @OnEvent('story.published')
  async handleStoryPublished(event: StoryPublishedEvent): Promise<void> {
    this.logger.info(`Handling story published event: ${event.storyId}`, 'StoriesEventHandler');
  }

  @OnEvent('story.archived')
  async handleStoryArchived(event: StoryArchivedEvent): Promise<void> {
    this.logger.info(`Handling story archived event: ${event.storyId}`, 'StoriesEventHandler');
  }

  @OnEvent('story.deleted')
  async handleStoryDeleted(event: StoryDeletedEvent): Promise<void> {
    this.logger.info(`Handling story deleted event: ${event.storyId}`, 'StoriesEventHandler');
  }

  // ---------------------------------------------------------------------------
  // Denormalised counters.
  //
  // `stories.like_count` and `stories.comment_count` were initialised to 0 by `StoriesService.create`
  // and then never written again. The consequences were not subtle: the story response exposes
  // `like_count` as `reactions`, and `SearchRepository.searchStories` orders on the same column for
  // `sortBy=reactions`, so every story sorted as if nobody had ever read it.
  //
  // `comment.created` counts replies as well as top-level comments, because the story's total is
  // what the column means — `findByStory` excludes replies from the LISTING, not from the count.
  //
  // `comment.reacted` is deliberately absent: a reaction is not a comment.
  // ---------------------------------------------------------------------------

  @OnEvent('story.reacted')
  async handleStoryReacted(event: { userId: string; storyId: string; reactionType: string }): Promise<void> {
    await this.bump('story.reacted', event.storyId, (repository) => repository.incrementLikeCount(event.storyId));
  }

  @OnEvent('story.reaction.removed')
  async handleStoryReactionRemoved(event: { userId: string; storyId: string }): Promise<void> {
    await this.bump('story.reaction.removed', event.storyId, (repository) =>
      repository.decrementLikeCount(event.storyId),
    );
  }

  @OnEvent('comment.created')
  async handleCommentCreated(event: {
    commentId: string;
    storyId: string;
    authorId: string;
    parentId?: string;
  }): Promise<void> {
    await this.bump('comment.created', event.storyId, (repository) => repository.incrementCommentCount(event.storyId));
  }

  @OnEvent('comment.deleted')
  async handleCommentDeleted(event: { commentId: string; storyId: string }): Promise<void> {
    await this.bump('comment.deleted', event.storyId, (repository) => repository.decrementCommentCount(event.storyId));
  }

  /**
   * WHY THE CACHE IS INVALIDATED TOO. `StoriesService.findById` caches the whole story row under
   * `story:<id>` for 600s, and `likeCount` / `commentCount` ride inside that payload. Bumping the
   * counter in the database without dropping the key would leave the API serving the pre-reaction
   * number for up to ten minutes. The slug variant is not invalidated separately: it is invalidated
   * by `StoriesService.invalidateStoryCache` on every write path, and a reaction does not change a
   * slug, so only the id-keyed read can be stale here.
   *
   * WHY A FAILURE IS LOGGED AND SWALLOWED. The reaction or comment is already committed by the time
   * this runs. Throwing would report the user's action as failed and invite a retry that collides
   * with the unique index on the reaction itself. A drifted counter is derived state and is
   * recoverable by a recompute; a lost reaction is not.
   */
  private async bump(
    eventName: string,
    storyId: string,
    run: (repository: IStoriesRepository) => Promise<void>,
  ): Promise<void> {
    try {
      await run(this.storiesRepository);
      await this.cache.invalidateKey(STORY_CACHE_NAMESPACE, storyId, [STORIES_CACHE_TAG]);
    } catch (error) {
      this.logger.error(
        `Counter maintenance failed for ${eventName} on story ${storyId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        undefined,
        'StoriesEventHandler',
      );
    }
  }
}
