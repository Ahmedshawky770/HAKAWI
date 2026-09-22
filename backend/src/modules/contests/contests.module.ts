import { Module } from '@nestjs/common';
import { ContestsService } from './services/contests.service.js';
import { ContestsController } from './controllers/contests.controller.js';
import { ContestsRepository } from './repositories/contests.repository.js';

@Module({
  imports: [],
  controllers: [ContestsController],
  providers: [ContestsService, ContestsRepository],
  exports: [ContestsService],
})
export class ContestsModule {}
