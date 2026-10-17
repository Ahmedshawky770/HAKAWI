import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ModerationContentRemovedEvent } from '../../../common/events/moderation.events.ts';
import type { IStoriesRepository } from '../interfaces/stories-repository.interface.ts';
import { STORIES_REPOSITORY } from '../interfaces/stories-repository.interface.ts';
import { StoriesService } from '../stories.service.ts';

/**
 * Applies a moderator's `content_removal` decision to a story, through this module's own delete.
 *
 * WHY THIS EXISTS. `ModerationService.takeAction` recorded `content_removal`, wrote the audit row
 * and emitted `moderation.action.taken` — and nothing anywhere deleted or hid the reported story, so
 * an admin who chose "remove this" left the content live for every reader. The delete route is
 * `JwtAuthGuard + OwnershipGuard`, so a moderator had no HTTP path to take it down either. This
 * consumer is the missing half: it is the only thing that turns the recorded decision into a write
 * on the story.
 *
 * WHY IT LIVES IN THE STORIES MODULE AND NOT IN MODERATION. `moderation` must not import the
 * stories repository — `docs/module-boundaries/dependency-rules.md` puts cross-module work on the
 * event bus, and the reference pattern is `rentals/events/rentals.event-handler.ts`, where another
 * module's fact (a completed payment) is applied from an event by the module that owns the row.
 * Moderation decides WHAT should happen to a reported story; this module owns HOW a story is
 * deleted (Principle #7). The direction is one-way and stays so: `ModerationModule` never imports
 * `StoriesModule`, and this handler adds no dependency from stories to moderation either — it
 * consumes a `common/events` contract, exactly like every other handler in this file's siblings.
 *
 * WHY IT CALLS `StoriesService.delete` INSTEAD OF `softDelete` ON THE REPOSITORY. Deletion here is
 * not one statement, it is a sequence this module has already debugged once: `softDelete` keeps the
 * row readable for its author, `invalidateStoryCache` drops the id-keyed and slug-keyed entries AND
 * sweeps the search tag that projects this story, and `story.deleted` is emitted for the Sanity
 * mirror and the story counters. Writing those steps a second time from a moderation consumer would
 * be a fork of one module's business rules that only a human keeps in step — the defect this
 * codebase already recorded for `user_restrictions`, where two writers with two expiry rules made
 * the audit trail and the enforcement disagree (Principle #9). Calling the service means there is
 * exactly one code path that deletes a story, and a future fix to that path applies to a moderator's
 * removal for free (Principle #8).
 *
 * WHY THE OWNER IS THE ACTOR ON THE CALL, AND WHY THAT IS NOT AN ESCALATION. `delete(id, userId)`
 * takes the author's id because it is the author's own permission being expressed, and the caller
 * that must survive is the one holding a moderator's credential, not an HTTP caller. The handler
 * reads the story first anyway — see `handleModerationContentRemoved` — so the id it passes is the
 * author the row itself names, resolved through this module's own repository. The authorisation this
 * route performs is nowhere in this path: the decision to remove was made by an admin on a
 * `@Secured` route with `REPORTS_VIEW`/`ACTIONS_CREATE`, and that is where it belongs. All this
 * handler does is stop dropping that decision on the floor.
 */
@Injectable()
export class ModerationContentRemovalEventHandler {
  constructor(
    @Inject(StoriesService) private readonly storiesService: StoriesService,
    @Inject(STORIES_REPOSITORY) private readonly storiesRepository: IStoriesRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('moderation.content.removed')
  async handleModerationContentRemoved(event: ModerationContentRemovedEvent): Promise<void> {
    // One event, several modules: `payment.completed` is consumed by both rentals and library the
    // same way. Every module filters on the part of the payload it owns, so neither needs to know
    // the other exists (Principle #7). A comment or a user target is not this module's fact.
    if (event.targetType !== 'story') {
      return;
    }

    try {
      const story = await this.storiesRepository.findById(event.targetId);

      // WHY AN ABSENT OR ALREADY-DELETED STORY IS A NO-OP. The report can be older than the
      // content: an author may have deleted their own story between the report and the decision,
      // and a replayed or duplicated event finds a row that is already gone. The outcome the
      // moderator asked for has therefore already happened, and raising would turn an idempotent
      // second delivery into a failure (Principle #16).
      if (!story || story.deletedAt) {
        this.logger.info(
          `Story ${event.targetId} from report ${event.reportId} is already absent; nothing to remove`,
          'ModerationContentRemovalEventHandler',
        );
        return;
      }

      this.logger.info(
        `Removing story ${story.id} reported by report ${event.reportId} on the instruction of admin ${event.adminId}: ${event.reason}`,
        'ModerationContentRemovalEventHandler',
      );

      // The author's id is what lets this reuse the module's single delete path; see the class note.
      await this.storiesService.delete(story.id, story.authorId);

      this.logger.info(
        `Story ${story.id} removed for report ${event.reportId}`,
        'ModerationContentRemovalEventHandler',
      );
    } catch (error) {
      // WHY A FAILURE IS LOGGED AND NOT RETHROWN. `moderation.action.taken` has already been
      // recorded and the admin's response has already been written: the audit trail says the
      // content was removed, and a 500 raised out of an event consumer would not reach that admin
      // anyway — it would surface as an unhandled rejection in a process nobody is watching, and
      // with an async listener the emitting request has already returned. Logging at ERROR keeps
      // the failure alertable and leaves the recorded decision as the one place an operator can
      // re-issue it from. The read above is also what makes a common failure — a story deleted
      // between the read and the delete — a `NotFoundException` rather than a crash.
      this.logger.error(
        `Content removal failed for story ${event.targetId} (report ${event.reportId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        undefined,
        'ModerationContentRemovalEventHandler',
      );
    }
  }
}
