import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { RentalCreatedEvent, RentalExtendedEvent, RentalReturnedEvent, RentalExpiredEvent } from '../../../common/events/rentals.events.ts';
import type { IRentalsRepository } from '../interfaces/rentals-repository.interface.ts';
import { RENTALS_REPOSITORY } from '../interfaces/rentals-repository.interface.ts';

@Injectable()
export class RentalsEventHandler {
  constructor(
    @Inject(RENTALS_REPOSITORY) private readonly rentalsRepository: IRentalsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('rental.created')
  async handleRentalCreated(event: RentalCreatedEvent): Promise<void> {
    this.logger.info(`Handling rental created event: ${event.rentalId}`, 'RentalsEventHandler');
  }

  @OnEvent('rental.extended')
  async handleRentalExtended(event: RentalExtendedEvent): Promise<void> {
    this.logger.info(`Handling rental extended event: ${event.rentalId}`, 'RentalsEventHandler');
  }

  @OnEvent('rental.returned')
  async handleRentalReturned(event: RentalReturnedEvent): Promise<void> {
    this.logger.info(`Handling rental returned event: ${event.rentalId}`, 'RentalsEventHandler');
  }

  @OnEvent('rental.expired')
  async handleRentalExpired(event: RentalExpiredEvent): Promise<void> {
    this.logger.info(`Handling rental expired event: ${event.rentalId}`, 'RentalsEventHandler');
  }
}
