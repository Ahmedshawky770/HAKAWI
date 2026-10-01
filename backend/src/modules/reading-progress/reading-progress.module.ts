import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';

import { ReadingProgressService } from './reading-progress.service.ts';
import { ReadingProgressController } from './controllers/reading-progress.controller.ts';
import { ReadingProgressRepository } from './repositories/reading-progress.repository.ts';
import { READING_PROGRESS_REPOSITORY } from './interfaces/reading-progress-repository.interface.ts';
import { ReadingProgressEventHandler } from './events/reading-progress.event-handler.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [ReadingProgressController],
  providers: [
    ReadingProgressService,
    ReadingProgressRepository,
    ReadingProgressEventHandler,
    { provide: READING_PROGRESS_REPOSITORY, useExisting: ReadingProgressRepository },
  ],
  exports: [ReadingProgressService],
})
export class ReadingProgressModule {}
