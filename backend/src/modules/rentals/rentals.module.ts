import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { SharedCacheModule } from '../shared/cache/shared-cache.module.ts';

import { RentalsService } from './rentals.service.ts';
import { RentalsEventHandler } from './events/rentals.event-handler.ts';
import { PaymentsModule } from '../payments/payments.module.ts';
import { RentalsController } from './controllers/rentals.controller.ts';
import { RentalsRepository } from './repositories/rentals.repository.ts';
import { RENTALS_REPOSITORY } from './interfaces/rentals-repository.interface.ts';

@Module({
  // PaymentsModule is imported so `RentalsEventHandler` can read the completed payment it grants a
  // rental FOR. That edge is the whole commercial flow: without it there is no path from "the gateway
  // confirmed the payment" to "the reader has access", which is the defect this closes. The read goes
  // through `IPaymentsRepository`; the rentals module never writes a payment.
  imports: [CommonModule, DatabaseModule, SharedCacheModule, PaymentsModule],
  controllers: [RentalsController],
  providers: [
    RentalsService,
    RentalsEventHandler,
    RentalsRepository,
    RentalsEventHandler,
    { provide: RENTALS_REPOSITORY, useExisting: RentalsRepository },
  ],
  exports: [RentalsService],
})
export class RentalsModule {}
