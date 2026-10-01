import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { PaymentsModule } from '../payments/payments.module.ts';
import { RentalsModule } from '../rentals/rentals.module.ts';

import { BooksRepository } from './repositories/books.repository.ts';
import { BOOKS_REPOSITORY } from './interfaces/books-repository.interface.ts';
import { BooksService } from './books.service.ts';
import { BooksController } from './controllers/books.controller.ts';
import { BooksEventHandler } from './events/books.event-handler.ts';

@Module({
  imports: [CommonModule, DatabaseModule, PaymentsModule, RentalsModule],
  controllers: [BooksController],
  providers: [
    BooksService,
    BooksRepository,
    BooksEventHandler,
    { provide: BOOKS_REPOSITORY, useExisting: BooksRepository },
  ],
  exports: [BooksService],
})
export class BooksModule {}
