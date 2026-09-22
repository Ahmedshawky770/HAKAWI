import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './services/payments.service.js';
import { PAYMENTS_REPOSITORY } from './interfaces/payments-repository.interface.js';
import { PaymentsRepository } from './repositories/payments.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENTS_REPOSITORY,
      useClass: PaymentsRepository,
    },
  ],
  exports: [PaymentsService, PAYMENTS_REPOSITORY],
})
export class PaymentsModule {}
