import { Module } from '@nestjs/common';
import { RefundsController } from './refunds.controller.js';
import { RefundsService } from './services/refunds.service.js';
import { REFUNDS_REPOSITORY } from './interfaces/refunds-repository.interface.js';
import { RefundsRepository } from './repositories/refunds.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [RefundsController],
  providers: [
    RefundsService,
    {
      provide: REFUNDS_REPOSITORY,
      useClass: RefundsRepository,
    },
  ],
  exports: [RefundsService, REFUNDS_REPOSITORY],
})
export class RefundsModule {}
