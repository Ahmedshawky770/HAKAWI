import { Module } from '@nestjs/common';
import { BookReviewsService } from './services/book-reviews.service.js';
import { BookReviewsController } from './controllers/book-reviews.controller.js';
import { BookReviewsRepository } from './repositories/book-reviews.repository.js';

@Module({
  imports: [],
  controllers: [BookReviewsController],
  providers: [BookReviewsService, BookReviewsRepository],
  exports: [BookReviewsService],
})
export class BookReviewsModule {}
