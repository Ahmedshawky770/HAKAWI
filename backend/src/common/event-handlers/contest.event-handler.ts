import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';

@Injectable()
export class ContestEventHandler {
  private readonly logger: Logger;

  constructor(private readonly winstonLogger: WinstonLoggerService) {
    this.logger = new Logger(ContestEventHandler.name);
  }

  @OnEvent('contest.created')
  async handleContestCreated(event: { contestId: string; publisherId: string; title: string; theme: string }): Promise<void> {
    this.winstonLogger.log(`Contest created: ${event.contestId} - ${event.title}`, 'ContestEventHandler');
  }

  @OnEvent('contest.submission_created')
  async handleContestSubmissionCreated(event: { submissionId: string; contestId: string; userId: string; storyId: string }): Promise<void> {
    this.winstonLogger.log(`Contest submission created: ${event.submissionId} for contest ${event.contestId}`, 'ContestEventHandler');
  }

  @OnEvent('contest.vote_cast')
  async handleContestVoteCast(event: { voteId: string; contestId: string; userId: string; submissionId: string }): Promise<void> {
    this.winstonLogger.log(`Contest vote cast: ${event.voteId} on submission ${event.submissionId}`, 'ContestEventHandler');
  }

  @OnEvent('contest.winner_selected')
  async handleContestWinnerSelected(event: { contestId: string; winnerId: string; submissionId: string; prize: string }): Promise<void> {
    this.winstonLogger.log(`Contest winner selected: ${event.contestId} - winner ${event.winnerId}`, 'ContestEventHandler');
  }
}
