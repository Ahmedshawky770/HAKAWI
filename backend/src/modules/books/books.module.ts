import { Module } from '@nestjs/common';
import { BooksController } from './books.controller.js';
import { BooksService } from './services/books.service.js';
import { BOOKS_REPOSITORY } from './interfaces/books-repository.interface.js';
import { BooksRepository } from './repositories/books.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [BooksController],
  providers: [
    BooksService,
    {
      provide: BOOKS_REPOSITORY,
      useClass: BooksRepository,
    },
  ],
  exports: [BooksService, BOOKS_REPOSITORY],
})
export class BooksModule {}
