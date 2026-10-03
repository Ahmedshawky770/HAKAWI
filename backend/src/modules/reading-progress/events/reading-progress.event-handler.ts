import { Injectable, Inject } from '@nestjs/common';

import type { IReadingProgressRepository } from '../interfaces/reading-progress-repository.interface.ts';
import { READING_PROGRESS_REPOSITORY } from '../interfaces/reading-progress-repository.interface.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

@Injectable()
export class ReadingProgressEventHandler {
  constructor(
    @Inject(READING_PROGRESS_REPOSITORY) private readonly readingProgressRepository: IReadingProgressRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  handleReadingProgressStarted(progress: { userId: string; bookId: string }) {
    this.logger.info(
      `Reading progress started: user ${progress.userId}, book ${progress.bookId}`,
      'ReadingProgressEventHandler',
    );
  }

  handleReadingProgressCompleted(progress: { userId: string; bookId: string; progressId: string }) {
    this.logger.info(`Reading progress completed: ${progress.progressId}`, 'ReadingProgressEventHandler');
  }
}
