import { Module } from '@nestjs/common';
import { ContestBadgesService } from './services/contest-badges.service.js';
import { ContestBadgesController } from './controllers/contest-badges.controller.js';
import { ContestBadgesRepository } from './repositories/contest-badges.repository.js';

@Module({
  imports: [],
  controllers: [ContestBadgesController],
  providers: [ContestBadgesService, ContestBadgesRepository],
  exports: [ContestBadgesService],
})
export class ContestBadgesModule {}
