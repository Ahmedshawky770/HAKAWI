import { Module } from '@nestjs/common';
import { BookRentalsService } from './services/book-rentals.service.js';
import { BookRentalsController } from './controllers/book-rentals.controller.js';
import { BookRentalsRepository } from './repositories/book-rentals.repository.js';

@Module({
  imports: [],
  controllers: [BookRentalsController],
  providers: [BookRentalsService, BookRentalsRepository],
  exports: [BookRentalsService],
})
export class BookRentalsModule {}
