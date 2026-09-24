import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';

import { RentalsService } from './rentals.service.ts';
import { RentalsController } from './controllers/rentals.controller.ts';
import { RentalsRepository } from './repositories/rentals.repository.ts';
import { RENTALS_REPOSITORY } from './interfaces/rentals-repository.interface.ts';
import { RentalsEventHandler } from './events/rentals.event-handler.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [RentalsController],
  providers: [RentalsService, RentalsRepository, RentalsEventHandler, { provide: RENTALS_REPOSITORY, useExisting: RentalsRepository }],
  exports: [RentalsService],
})
export class RentalsModule {}
