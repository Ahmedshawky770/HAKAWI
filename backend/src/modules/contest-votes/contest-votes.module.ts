import { Module } from '@nestjs/common';
import { ContestVotesService } from './services/contest-votes.service.js';
import { ContestVotesController } from './controllers/contest-votes.controller.js';
import { ContestVotesRepository } from './repositories/contest-votes.repository.js';

@Module({
  imports: [],
  controllers: [ContestVotesController],
  providers: [ContestVotesService, ContestVotesRepository],
  exports: [ContestVotesService],
})
export class ContestVotesModule {}
