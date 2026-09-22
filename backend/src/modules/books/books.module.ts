import { Module } from '@nestjs/common';
import { BooksService } from './services/books.service.js';
import { BooksController } from './controllers/books.controller.js';
import { BooksRepository } from './repositories/books.repository.js';

@Module({
  imports: [],
  controllers: [BooksController],
  providers: [BooksService, BooksRepository],
  exports: [BooksService],
})
export class BooksModule {}
