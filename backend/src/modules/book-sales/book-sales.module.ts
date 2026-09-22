import { Module } from '@nestjs/common';
import { BookSalesService } from './services/book-sales.service.js';
import { BookSalesController } from './controllers/book-sales.controller.js';
import { BookSalesRepository } from './repositories/book-sales.repository.js';

@Module({
  imports: [],
  controllers: [BookSalesController],
  providers: [BookSalesService, BookSalesRepository],
  exports: [BookSalesService],
})
export class BookSalesModule {}
