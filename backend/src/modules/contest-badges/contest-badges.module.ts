import { Module } from '@nestjs/common';
import { ContestBadgesController } from './contest-badges.controller.js';
import { ContestBadgesService } from './services/contest-badges.service.js';
import { CONTEST_BADGES_REPOSITORY } from './interfaces/contest-badges-repository.interface.js';
import { ContestBadgesRepository } from './repositories/contest-badges.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [ContestBadgesController],
  providers: [
    ContestBadgesService,
    {
      provide: CONTEST_BADGES_REPOSITORY,
      useClass: ContestBadgesRepository,
    },
  ],
  exports: [ContestBadgesService, CONTEST_BADGES_REPOSITORY],
})
export class ContestBadgesModule {}
