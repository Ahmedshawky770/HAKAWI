import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';

import { PaymentsService } from './payments.service.ts';
import { PaymentsController } from './controllers/payments.controller.ts';
import { PaymentsRepository } from './repositories/payments.repository.ts';
import { PAYMENTS_REPOSITORY } from './interfaces/payments-repository.interface.ts';
import { PaymentsEventHandler } from './events/payments.event-handler.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository, PaymentsEventHandler, { provide: PAYMENTS_REPOSITORY, useExisting: PaymentsRepository }],
  exports: [PaymentsService],
})
export class PaymentsModule {}
