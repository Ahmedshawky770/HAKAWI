import { Module } from '@nestjs/common';
import { PrizeTransactionsService } from './services/prize-transactions.service.js';
import { PrizeTransactionsController } from './controllers/prize-transactions.controller.js';
import { PrizeTransactionsRepository } from './repositories/prize-transactions.repository.js';

@Module({
  imports: [],
  controllers: [PrizeTransactionsController],
  providers: [PrizeTransactionsService, PrizeTransactionsRepository],
  exports: [PrizeTransactionsService],
})
export class PrizeTransactionsModule {}
