import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IBookReviewsRepository, UpdateBookReviewData } from '../interfaces/book-reviews-repository.interface.js';
import { BOOK_REVIEWS_REPOSITORY } from '../interfaces/book-reviews-repository.interface.js';
import { BookReviewsRepository } from '../repositories/book-reviews.repository.js';
import { CreateBookReviewDto } from '../dto/book-reviews.dto.js';

@Injectable()
export class BookReviewsService {
  private readonly logger = new Logger(BookReviewsService.name);

  constructor(
    @Inject(BOOK_REVIEWS_REPOSITORY) private readonly reviewsRepository: BookReviewsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findByBookId(bookId: string): Promise<unknown[]> {
    return this.reviewsRepository.findByBookId(bookId);
  }

  async findByUserId(userId: string): Promise<unknown[]> {
    return this.reviewsRepository.findByUserId(userId);
  }

  async create(userId: string, bookId: string, data: CreateBookReviewDto): Promise<unknown> {
    const existing = await this.reviewsRepository.findByBookAndUser(bookId, userId);
    if (existing) {
      throw new ConflictException('You have already reviewed this book');
    }
    const review = await this.reviewsRepository.create({ ...data, bookId, userId });
    this.eventEmitter.emit('book.reviewed', { bookId, userId, rating: data.rating });
    return review;
  }

  async update(id: string, userId: string, data: Partial<UpdateBookReviewData>): Promise<unknown> {
    const review = await this.reviewsRepository.findById(id);
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (review.userId !== userId) {
      throw new BadRequestException('You can only update your own reviews');
    }
    return this.reviewsRepository.update(id, data);
  }

  async delete(id: string, userId: string): Promise<void> {
    const review = await this.reviewsRepository.findById(id);
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (review.userId !== userId) {
      throw new BadRequestException('You can only delete your own reviews');
    }
    await this.reviewsRepository.delete(id);
  }
}
