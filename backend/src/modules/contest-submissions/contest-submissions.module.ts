import { Module } from '@nestjs/common';
import { ContestSubmissionsController } from './contest-submissions.controller.js';
import { ContestSubmissionsService } from './services/contest-submissions.service.js';
import { CONTEST_SUBMISSIONS_REPOSITORY } from './interfaces/contest-submissions-repository.interface.js';
import { ContestSubmissionsRepository } from './repositories/contest-submissions.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [ContestSubmissionsController],
  providers: [
    ContestSubmissionsService,
    {
      provide: CONTEST_SUBMISSIONS_REPOSITORY,
      useClass: ContestSubmissionsRepository,
    },
  ],
  exports: [ContestSubmissionsService, CONTEST_SUBMISSIONS_REPOSITORY],
})
export class ContestSubmissionsModule {}
