import { Module } from '@nestjs/common';
import { WithdrawalsService } from './services/withdrawals.service.js';
import { WithdrawalsController } from './controllers/withdrawals.controller.js';
import { WithdrawalsRepository } from './repositories/withdrawals.repository.js';

@Module({
  imports: [],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService, WithdrawalsRepository],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}
