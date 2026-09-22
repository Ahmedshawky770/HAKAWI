import { Module } from '@nestjs/common';
import { ContestsController } from './contests.controller.js';
import { ContestsService } from './services/contests.service.js';
import { CONTESTS_REPOSITORY } from './interfaces/contests-repository.interface.js';
import { ContestsRepository } from './repositories/contests.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [ContestsController],
  providers: [
    ContestsService,
    {
      provide: CONTESTS_REPOSITORY,
      useClass: ContestsRepository,
    },
  ],
  exports: [ContestsService, CONTESTS_REPOSITORY],
})
export class ContestsModule {}
