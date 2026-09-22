import { Module } from '@nestjs/common';
import { BookSalesController } from './book-sales.controller.js';
import { BookSalesService } from './services/book-sales.service.js';
import { BOOK_SALES_REPOSITORY } from './interfaces/book-sales-repository.interface.js';
import { BookSalesRepository } from './repositories/book-sales.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [BookSalesController],
  providers: [
    BookSalesService,
    {
      provide: BOOK_SALES_REPOSITORY,
      useClass: BookSalesRepository,
    },
  ],
  exports: [BookSalesService, BOOK_SALES_REPOSITORY],
})
export class BookSalesModule {}
