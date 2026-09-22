import { Module } from '@nestjs/common';
import { ContestVotesController } from './contest-votes.controller.js';
import { ContestVotesService } from './services/contest-votes.service.js';
import { CONTEST_VOTES_REPOSITORY } from './interfaces/contest-votes-repository.interface.js';
import { ContestVotesRepository } from './repositories/contest-votes.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [ContestVotesController],
  providers: [
    ContestVotesService,
    {
      provide: CONTEST_VOTES_REPOSITORY,
      useClass: ContestVotesRepository,
    },
  ],
  exports: [ContestVotesService, CONTEST_VOTES_REPOSITORY],
})
export class ContestVotesModule {}
