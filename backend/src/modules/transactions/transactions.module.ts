import { Module } from '@nestjs/common';
import { TransactionsService } from './services/transactions.service.js';
import { TransactionsController } from './controllers/transactions.controller.js';
import { TransactionsRepository } from './repositories/transactions.repository.js';

@Module({
  imports: [],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository],
  exports: [TransactionsService],
})
export class TransactionsModule {}
