import { Module } from '@nestjs/common';
import { BookReviewsController } from './book-reviews.controller.js';
import { BookReviewsService } from './services/book-reviews.service.js';
import { BOOK_REVIEWS_REPOSITORY } from './interfaces/book-reviews-repository.interface.js';
import { BookReviewsRepository } from './repositories/book-reviews.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [BookReviewsController],
  providers: [
    BookReviewsService,
    {
      provide: BOOK_REVIEWS_REPOSITORY,
      useClass: BookReviewsRepository,
    },
  ],
  exports: [BookReviewsService, BOOK_REVIEWS_REPOSITORY],
})
export class BookReviewsModule {}
