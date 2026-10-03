import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { CommentCreatedEvent, CommentUpdatedEvent, CommentDeletedEvent } from '../../../common/events/social.events.ts';
import type { ICommentsRepository } from '../interfaces/comments-repository.interface.ts';
import { COMMENTS_REPOSITORY } from '../interfaces/comments-repository.interface.ts';

@Injectable()
export class CommentsEventHandler {
  constructor(
    @Inject(COMMENTS_REPOSITORY) private readonly commentsRepository: ICommentsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('comment.created')
  async handleCommentCreated(event: CommentCreatedEvent): Promise<void> {
    this.logger.info(
      `Comment ${event.commentId} created on story ${event.storyId} by user ${event.authorId}`,
      'CommentsEventHandler',
    );
  }

  @OnEvent('comment.updated')
  async handleCommentUpdated(event: CommentUpdatedEvent): Promise<void> {
    this.logger.info(`Comment ${event.commentId} updated on story ${event.storyId}`, 'CommentsEventHandler');
  }

  @OnEvent('comment.deleted')
  async handleCommentDeleted(event: CommentDeletedEvent): Promise<void> {
    this.logger.info(`Comment ${event.commentId} deleted from story ${event.storyId}`, 'CommentsEventHandler');
  }

  @OnEvent('comment.reacted')
  async handleCommentReacted(event: { userId: string; commentId: string; reactionType: string }): Promise<void> {
    await this.bump('comment.reacted', event.commentId, (repository) => repository.incrementLikeCount(event.commentId));
  }

  @OnEvent('comment.reaction.removed')
  async handleCommentReactionRemoved(event: { userId: string; commentId: string }): Promise<void> {
    await this.bump('comment.reaction.removed', event.commentId, (repository) =>
      repository.decrementLikeCount(event.commentId),
    );
  }

  /**
   * WHY `comments.like_count` IS MAINTAINED HERE AND NOT IN `CommentReactionsService`.
   *
   * The column existed, `comments.likeCount` is rendered directly to the client next to the
   * reaction list, and nothing ever wrote it — so every comment showed zero likes no matter how
   * many it had. Two options existed: have the reactions service write the comments table, or let
   * the comments module react to its own domain event. The second was chosen because
   * `CommentReactionsService` holds only `COMMENT_REACTIONS_REPOSITORY`; writing `comments` from
   * there would put one module's table behind another's repository and require a
   * `CommentsModule -> CommentReactionsModule` import to carry it. This is the same arrangement
   * `ContentModerationEventHandler` uses, for the same stated reason.
   *
   * WHY A FAILURE IS LOGGED AND SWALLOWED. A reaction is already committed by the time this runs.
   * If the counter write threw, the caller's reaction would be reported as failed and they would
   * retry, producing a duplicate-violation on the reaction itself. The counter is derived state, so
   * a drifted value is recoverable by a recompute while a lost reaction is not.
   */
  private async bump(
    eventName: string,
    commentId: string,
    run: (repository: ICommentsRepository) => Promise<void>,
  ): Promise<void> {
    try {
      await run(this.commentsRepository);
    } catch (error) {
      this.logger.error(
        `Counter maintenance failed for ${eventName} on comment ${commentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        undefined,
        'CommentsEventHandler',
      );
    }
  }
}
