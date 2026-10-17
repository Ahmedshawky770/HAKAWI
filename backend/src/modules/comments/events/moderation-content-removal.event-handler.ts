import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ModerationContentRemovedEvent } from '../../../common/events/moderation.events.ts';
import type { ICommentsRepository } from '../interfaces/comments-repository.interface.ts';
import { COMMENTS_REPOSITORY } from '../interfaces/comments-repository.interface.ts';
import { CommentsService } from '../comments.service.ts';

/**
 * Applies a moderator's `content_removal` decision to a comment, through this module's own delete.
 *
 * The story-shaped twin of this consumer is
 * `stories/events/moderation-content-removal.event-handler.ts`, and every decision recorded there
 * holds here for the same reasons — a `content_removal` that removed nothing, cross-module work on
 * the event bus rather than by repository import, and one delete path per owning module. What is
 * specific to a comment is stated below.
 *
 * WHY THIS DOES NOT TOUCH THE STORY. `CommentsService.delete` lowers the parent's `reply_count` and
 * emits `comment.deleted`, which `StoriesEventHandler` consumes to lower the story's
 * `comment_count` — so the story's counters stay correct without this module knowing that a story
 * counter exists. The cascade is already written, once, in the events; adding a second path to it
 * from here would be the two-writers-of-one-fact shape Principle #9 exists to prevent.
 *
 * WHY THE AUTHOR IS THE ACTOR ON THE CALL. `CommentsService.delete(id, authorId)` compares
 * `comment.authorId` against its second argument, and the removal has to pass that comparison
 * without becoming a privilege for the moderator who ordered it. Passing the id the ROW itself
 * names — read through this module's own repository — expresses "the author's own delete ran", which
 * is the path that already carries the counter maintenance and the event. The authorisation for a
 * moderation removal happened on `POST /moderation/reports/:id/actions`, behind `@Secured` and
 * `ACTIONS_CREATE`; this handler is only the delivery.
 */
@Injectable()
export class ModerationContentRemovalEventHandler {
  constructor(
    @Inject(CommentsService) private readonly commentsService: CommentsService,
    @Inject(COMMENTS_REPOSITORY) private readonly commentsRepository: ICommentsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('moderation.content.removed')
  async handleModerationContentRemoved(event: ModerationContentRemovedEvent): Promise<void> {
    // One event, several modules: each consumer filters on the part of the payload it owns, the way
    // the rentals and library consumers both subscribe to `payment.completed` and each act on its
    // own metadata (Principle #7). A story or a user target is not this module's fact.
    if (event.targetType !== 'comment') {
      return;
    }

    try {
      // `findById` returns soft-deleted rows too — the flag is how the read side knows — which is
      // what makes the check below possible without a second query shape.
      const comment = await this.commentsRepository.findById(event.targetId);

      // WHY AN ABSENT OR ALREADY-DELETED COMMENT IS A NO-OP. The report can be older than the
      // content: its author may have deleted the comment themselves between the report and the
      // decision, and a replayed or duplicated event finds a row that is already gone. The outcome
      // the moderator asked for has therefore already happened, and raising would turn an idempotent
      // second delivery into a failure (Principle #16). Decrementing `reply_count` twice for one
      // deletion would also leave the parent's counter permanently wrong.
      if (!comment || comment.isDeleted) {
        this.logger.info(
          `Comment ${event.targetId} from report ${event.reportId} is already absent; nothing to remove`,
          'ModerationContentRemovalEventHandler',
        );
        return;
      }

      this.logger.info(
        `Removing comment ${comment.id} reported by report ${event.reportId} on the instruction of admin ${event.adminId}: ${event.reason}`,
        'ModerationContentRemovalEventHandler',
      );

      await this.commentsService.delete(comment.id, comment.authorId);

      this.logger.info(
        `Comment ${comment.id} removed for report ${event.reportId}`,
        'ModerationContentRemovalEventHandler',
      );
    } catch (error) {
      // WHY A FAILURE IS LOGGED AND NOT RETHROWN. The audit row is already written and the admin's
      // response has already been sent: an exception out of an async event consumer reaches nobody
      // who can act on it, and with an async listener the request that emitted it has already
      // returned. Logging at ERROR keeps the failure alertable and leaves the recorded decision as
      // the place an operator re-issues it from — the same posture `CommentsEventHandler.bump`
      // takes for the counters it maintains.
      this.logger.error(
        `Content removal failed for comment ${event.targetId} (report ${event.reportId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        undefined,
        'ModerationContentRemovalEventHandler',
      );
    }
  }
}
