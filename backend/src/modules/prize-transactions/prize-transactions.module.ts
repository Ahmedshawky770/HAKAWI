import { Module } from '@nestjs/common';
import { PrizeTransactionsController } from './prize-transactions.controller.js';
import { PrizeTransactionsService } from './services/prize-transactions.service.js';
import { PRIZE_TRANSACTIONS_REPOSITORY } from './interfaces/prize-transactions-repository.interface.js';
import { PrizeTransactionsRepository } from './repositories/prize-transactions.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [PrizeTransactionsController],
  providers: [
    PrizeTransactionsService,
    {
      provide: PRIZE_TRANSACTIONS_REPOSITORY,
      useClass: PrizeTransactionsRepository,
    },
  ],
  exports: [PrizeTransactionsService, PRIZE_TRANSACTIONS_REPOSITORY],
})
export class PrizeTransactionsModule {}
