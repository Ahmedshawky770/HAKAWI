import { Module } from '@nestjs/common';
import { BookRentalsController } from './book-rentals.controller.js';
import { BookRentalsService } from './services/book-rentals.service.js';
import { BOOK_RENTALS_REPOSITORY } from './interfaces/book-rentals-repository.interface.js';
import { BookRentalsRepository } from './repositories/book-rentals.repository.js';
import { RentalExtensionsModule } from '../rental-extensions/rental-extensions.module.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule, RentalExtensionsModule],
  controllers: [BookRentalsController],
  providers: [
    BookRentalsService,
    {
      provide: BOOK_RENTALS_REPOSITORY,
      useClass: BookRentalsRepository,
    },
  ],
  exports: [BookRentalsService, BOOK_RENTALS_REPOSITORY],
})
export class BookRentalsModule {}
