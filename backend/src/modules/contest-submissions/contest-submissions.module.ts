import { Module } from '@nestjs/common';
import { ContestSubmissionsService } from './services/contest-submissions.service.js';
import { ContestSubmissionsController } from './controllers/contest-submissions.controller.js';
import { ContestSubmissionsRepository } from './repositories/contest-submissions.repository.js';

@Module({
  imports: [],
  controllers: [ContestSubmissionsController],
  providers: [ContestSubmissionsService, ContestSubmissionsRepository],
  exports: [ContestSubmissionsService],
})
export class ContestSubmissionsModule {}
