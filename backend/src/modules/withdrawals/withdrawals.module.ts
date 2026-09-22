import { Module } from '@nestjs/common';
import { WithdrawalsController } from './withdrawals.controller.js';
import { WithdrawalsService } from './services/withdrawals.service.js';
import { WITHDRAWALS_REPOSITORY } from './interfaces/withdrawals-repository.interface.js';
import { WithdrawalsRepository } from './repositories/withdrawals.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [WithdrawalsController],
  providers: [
    WithdrawalsService,
    {
      provide: WITHDRAWALS_REPOSITORY,
      useClass: WithdrawalsRepository,
    },
  ],
  exports: [WithdrawalsService, WITHDRAWALS_REPOSITORY],
})
export class WithdrawalsModule {}
