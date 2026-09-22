import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './services/transactions.service.js';
import { TRANSACTIONS_REPOSITORY } from './interfaces/transactions-repository.interface.js';
import { TransactionsRepository } from './repositories/transactions.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    {
      provide: TRANSACTIONS_REPOSITORY,
      useClass: TransactionsRepository,
    },
  ],
  exports: [TransactionsService, TRANSACTIONS_REPOSITORY],
})
export class TransactionsModule {}
