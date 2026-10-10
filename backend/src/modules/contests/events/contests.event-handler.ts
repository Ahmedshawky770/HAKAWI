import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  ContestCreatedEvent,
  ContestStartedEvent,
  ContestCompletedEvent,
  SubmissionSubmittedEvent,
  SubmissionApprovedEvent,
  SubmissionRejectedEvent,
  VoteCastEvent,
  WinnerSelectedEvent,
  PrizeDistributedEvent,
} from '../../../common/events/contests.events.ts';
import type { IContestsRepository } from '../interfaces/contests-repository.interface.ts';
import { CONTESTS_REPOSITORY } from '../interfaces/contests-repository.interface.ts';
import type { ContestSubmission } from '../types.ts';
import { NotificationsService } from '../../notifications/notifications.service.ts';

/**
 * Every one of these nine handlers was a `logger.info` and nothing else, so the roadmap's "Contest
 * notifications — event-driven ✅" described nine log lines. The notifications table, the preferences
 * table and the unread badge all existed; nothing ever wrote to them from a contest.
 *
 * WHY THEY GO THROUGH `NotificationsService` AND NOT THE REPOSITORY. The service is the only path
 * that consults the recipient's preferences and emits `notification.created`. The library grant was
 * built the same way for the same reason, and writing through the repository here would have made
 * preference suppression silently inapplicable to contests only.
 *
 * WHY NOTHING IS NOTIFIED ABOUT A CONTEST'S OWN AUTHOR. `contest.created` goes to nobody: the author
 * is the one person who knows, and a notification telling you about something you just did is noise.
 * The event is still consumed, and still logged.
 */
@Injectable()
export class ContestsEventHandler {
  constructor(
    @Inject(CONTESTS_REPOSITORY) private readonly contestsRepository: IContestsRepository,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('contest.created')
  async handleContestCreated(event: ContestCreatedEvent): Promise<void> {
    // Nobody is notified. The author is the only party that did not already know.
    this.logger.info(`Contest created: ${event.contestId} by user ${event.createdBy}`, 'ContestsEventHandler');
  }

  /**
   * The submission's AUTHOR, not the contest's — the organiser sees every entry in the dashboard, so
   * notifying them about each one is not information they lack.
   */
  @OnEvent('submission.submitted')
  async handleSubmissionSubmitted(event: SubmissionSubmittedEvent): Promise<void> {
    this.logger.info(
      `Submission submitted: ${event.submissionId} for contest ${event.contestId} by author ${event.authorId}`,
      'ContestsEventHandler',
    );

    await this.deliver(
      event.authorId,
      'submission.review',
      'Your story was submitted',
      'Your entry is awaiting review.',
      {
        submissionId: event.submissionId,
        contestId: event.contestId,
      },
    );
  }

  @OnEvent('submission.approved')
  async handleSubmissionApproved(event: SubmissionApprovedEvent): Promise<void> {
    this.logger.info(
      `Submission approved: ${event.submissionId} for contest ${event.contestId}`,
      'ContestsEventHandler',
    );

    await this.deliver(event.authorId, 'contest', 'Your entry was approved', 'Your story is now in the running.', {
      submissionId: event.submissionId,
      contestId: event.contestId,
    });
  }

  @OnEvent('submission.rejected')
  async handleSubmissionRejected(event: SubmissionRejectedEvent): Promise<void> {
    this.logger.info(
      `Submission rejected: ${event.submissionId} for contest ${event.contestId}`,
      'ContestsEventHandler',
    );

    await this.deliver(
      event.authorId,
      'contest',
      'Your entry was not accepted',
      'This time it did not make the running.',
      {
        submissionId: event.submissionId,
        contestId: event.contestId,
      },
    );
  }

  /**
   * THE AUTHOR OF THE VOTED-FOR SUBMISSION, not the voter.
   *
   * A vote notification to the author is the useful one — it tells a writer their story is being read.
   * Notifying the voter would congratulate them for voting, which is not a thing they need to be
   * congratulated about, and `contest.voted` is not a family in `notification_preferences`
   * (`follows`, `comments`, `storyReactions`, `mentions`, `system`), so it maps to `system`.
   *
   * A vote on the author's own entry is impossible: `ContestsService.castVote` refuses it.
   */
  @OnEvent('vote.cast')
  async handleVoteCast(event: VoteCastEvent): Promise<void> {
    this.logger.info(`Vote cast: ${event.voteId} on submission ${event.submissionId}`, 'ContestsEventHandler');

    const recipient = await this.authorOf(event.submissionId);
    if (recipient === null || recipient === event.userId) {
      return;
    }

    await this.deliver(recipient, 'system', 'Your story got a vote', 'Someone voted for your entry.', {
      submissionId: event.submissionId,
      contestId: event.contestId,
    });
  }

  @OnEvent('winner.selected')
  async handleWinnerSelected(event: WinnerSelectedEvent): Promise<void> {
    this.logger.info(`Winner selected for contest ${event.contestId}: ${event.winnerId}`, 'ContestsEventHandler');

    await this.deliver(event.winnerId, 'contest', 'Congratulations — you won', 'Your entry took first place.', {
      contestId: event.contestId,
      submissionId: event.submissionId,
    });
  }

  @OnEvent('contest.completed')
  async handleContestCompleted(event: ContestCompletedEvent): Promise<void> {
    this.logger.info(
      `Contest completed: ${event.contestId}, winner: ${event.winnerId ?? 'none'}`,
      'ContestsEventHandler',
    );

    // Nobody is notified here. `winner.selected` already tells the winner, and `contest.started`
    // already told the entrants; a third announcement from the same action is noise. The handler is
    // kept because the event is registered, and because dropping it would silently unregister it.
  }

  @OnEvent('contest.started')
  async handleContestStarted(event: ContestStartedEvent): Promise<void> {
    this.logger.info(`Contest started: ${event.contestId}`, 'ContestsEventHandler');

    // Every entrant is notified, so this resolves the contest's submissions rather than one row.
    const submissionIds = await this.submissionIdsFor(event.contestId);
    if (submissionIds.length === 0) {
      return;
    }

    const recipients = await this.authorsOf(submissionIds);
    const contestId = event.contestId;
    for (const authorId of recipients) {
      await this.deliver(authorId, 'contest', 'Your contest has started', 'Voting is now open.', { contestId });
    }
  }

  @OnEvent('prize.distributed')
  async handlePrizeDistributed(event: PrizeDistributedEvent): Promise<void> {
    this.logger.info(
      `Prize distributed for contest ${event.contestId} to winner ${event.winnerId}`,
      'ContestsEventHandler',
    );

    await this.deliver(event.winnerId, 'payment', 'Your prize', 'Your prize has been sent.', {
      contestId: event.contestId,
      prizeId: event.prizeId,
    });
  }

  private async authorOf(submissionId: string): Promise<string | null> {
    const submission = await this.contestsRepository.findSubmissionById(submissionId);
    return submission?.authorId ?? null;
  }

  private async submissionIdsFor(contestId: string): Promise<string[]> {
    // The repository is paginated, so an unbounded page is asked for deliberately: the set of
    // entrants is bounded by the contest, and a partial list would silently notify some of them.
    const { submissions } = await this.contestsRepository.findSubmissionsByContest(contestId, 1, 1000);
    return submissions.map((submission: ContestSubmission) => submission.id);
  }

  /** Distinct authors, so a writer with three entries is told once rather than three times. */
  private async authorsOf(submissionIds: string[]): Promise<string[]> {
    if (submissionIds.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    for (const submissionId of submissionIds) {
      const authorId = await this.authorOf(submissionId);
      if (authorId !== null) {
        seen.add(authorId);
      }
    }
    return [...seen];
  }

  /**
   * A notification is a side effect of the action, not the action. If it throws, the vote, the
   * approval and the prize distribution have already been committed and must not be reported as
   * failed — so the error is logged with the event name and swallowed. Without this, one unavailable
   * table would turn every successful vote in the product into a 500.
   */
  private async deliver(
    userId: string,
    type: string,
    title: string,
    message: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.notifications.create({ userId, type, title, message, data: JSON.stringify(data) });
    } catch (error) {
      this.logger.error(
        `Contest notification (${type}) to ${userId} failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'ContestsEventHandler',
      );
    }
  }
}
