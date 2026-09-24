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

@Injectable()
export class ContestsEventHandler {
  constructor(
    @Inject(CONTESTS_REPOSITORY) private readonly contestsRepository: IContestsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('contest.created')
  async handleContestCreated(event: ContestCreatedEvent): Promise<void> {
    this.logger.info(`Contest created: ${event.contestId} by user ${event.createdBy}`, 'ContestsEventHandler');
  }

  @OnEvent('contest.started')
  async handleContestStarted(event: ContestStartedEvent): Promise<void> {
    this.logger.info(`Contest started: ${event.contestId}`, 'ContestsEventHandler');
  }

  @OnEvent('contest.completed')
  async handleContestCompleted(event: ContestCompletedEvent): Promise<void> {
    this.logger.info(`Contest completed: ${event.contestId}, winner: ${event.winnerId}`, 'ContestsEventHandler');
  }

  @OnEvent('submission.submitted')
  async handleSubmissionSubmitted(event: SubmissionSubmittedEvent): Promise<void> {
    this.logger.info(`Submission submitted: ${event.submissionId} for contest ${event.contestId} by author ${event.authorId}`, 'ContestsEventHandler');
  }

  @OnEvent('submission.approved')
  async handleSubmissionApproved(event: SubmissionApprovedEvent): Promise<void> {
    this.logger.info(`Submission approved: ${event.submissionId} for contest ${event.contestId}`, 'ContestsEventHandler');
  }

  @OnEvent('submission.rejected')
  async handleSubmissionRejected(event: SubmissionRejectedEvent): Promise<void> {
    this.logger.info(`Submission rejected: ${event.submissionId} for contest ${event.contestId}`, 'ContestsEventHandler');
  }

  @OnEvent('vote.cast')
  async handleVoteCast(event: VoteCastEvent): Promise<void> {
    this.logger.info(`Vote cast: ${event.voteId} by user ${event.userId} for submission ${event.submissionId} in contest ${event.contestId}`, 'ContestsEventHandler');
  }

  @OnEvent('winner.selected')
  async handleWinnerSelected(event: WinnerSelectedEvent): Promise<void> {
    this.logger.info(`Winner selected for contest ${event.contestId}: submission ${event.submissionId}, winner ${event.winnerId}`, 'ContestsEventHandler');
  }

  @OnEvent('prize.distributed')
  async handlePrizeDistributed(event: PrizeDistributedEvent): Promise<void> {
    this.logger.info(`Prize distributed: ${event.prizeId} for contest ${event.contestId} to winner ${event.winnerId}`, 'ContestsEventHandler');
  }
}
