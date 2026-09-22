import { Module } from '@nestjs/common';
import { RefundsService } from './services/refunds.service.js';
import { RefundsController } from './controllers/refunds.controller.js';
import { RefundsRepository } from './repositories/refunds.repository.js';

@Module({
  imports: [],
  controllers: [RefundsController],
  providers: [RefundsService, RefundsRepository],
  exports: [RefundsService],
})
export class RefundsModule {}
