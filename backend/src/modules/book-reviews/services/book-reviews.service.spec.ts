import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BookReviewsService } from './book-reviews.service.js';
import type { BookReviewsRepository } from '../repositories/book-reviews.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

type MockBookReviewsRepository = {
  findById: ReturnType<typeof vi.fn>;
  findByBookId: ReturnType<typeof vi.fn>;
  findByUserId: ReturnType<typeof vi.fn>;
  findByBookAndUser: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

type MockEventEmitter2 = {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
};

const createMockBookReview = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'review-123',
  bookId: 'book-123',
  userId: 'user-123',
  rating: 5,
  comment: 'Great book!',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('BookReviewsService', () => {
  let bookReviewsService: BookReviewsService;
  let bookReviewsRepository: MockBookReviewsRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    bookReviewsRepository = {
      findById: vi.fn(),
      findByBookId: vi.fn(),
      findByUserId: vi.fn(),
      findByBookAndUser: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    bookReviewsService = new BookReviewsService(
      bookReviewsRepository as unknown as BookReviewsRepository,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('findByBookId', () => {
    it('should return reviews by book', async () => {
      const reviews = [createMockBookReview()];
      vi.mocked(bookReviewsRepository.findByBookId).mockResolvedValue(reviews as any);

      const result = await bookReviewsService.findByBookId('book-123');

      expect(result).toEqual(reviews);
    });
  });

  describe('findByUserId', () => {
    it('should return reviews by user', async () => {
      const reviews = [createMockBookReview()];
      vi.mocked(bookReviewsRepository.findByUserId).mockResolvedValue(reviews as any);

      const result = await bookReviewsService.findByUserId('user-123');

      expect(result).toEqual(reviews);
    });
  });

  describe('create', () => {
    it('should create review and emit event', async () => {
      const review = createMockBookReview();
      vi.mocked(bookReviewsRepository.findByBookAndUser).mockResolvedValue(null);
      vi.mocked(bookReviewsRepository.create).mockResolvedValue(review as any);

      const result = await bookReviewsService.create('user-123', 'book-123', { rating: 5, comment: 'Great!', bookId: 'book-123' });

      expect(result).toEqual(review);
      expect(eventEmitter.emit).toHaveBeenCalledWith('book.reviewed', {
        bookId: 'book-123',
        userId: 'user-123',
        rating: 5,
      });
    });

    it('should throw ConflictException when user already reviewed', async () => {
      vi.mocked(bookReviewsRepository.findByBookAndUser).mockResolvedValue(createMockBookReview() as any);

      await expect(bookReviewsService.create('user-123', 'book-123', { rating: 5, comment: 'Great!', bookId: 'book-123' }))
        .rejects.toThrow('You have already reviewed this book');
    });
  });

  describe('update', () => {
    it('should update review when user is owner', async () => {
      const review = createMockBookReview({ userId: 'user-123' });
      const updatedReview = createMockBookReview({ rating: 4 });
      vi.mocked(bookReviewsRepository.findById).mockResolvedValue(review as any);
      vi.mocked(bookReviewsRepository.update).mockResolvedValue(updatedReview as any);

      const result = await bookReviewsService.update('review-123', 'user-123', { rating: 4 });

      expect(result).toEqual(updatedReview);
    });

    it('should throw NotFoundException when review not found', async () => {
      vi.mocked(bookReviewsRepository.findById).mockResolvedValue(null);

      await expect(bookReviewsService.update('review-123', 'user-123', { rating: 4 }))
        .rejects.toThrow('Review not found');
    });

    it('should throw BadRequestException when user is not owner', async () => {
      const review = createMockBookReview({ userId: 'other-user' });
      vi.mocked(bookReviewsRepository.findById).mockResolvedValue(review as any);

      await expect(bookReviewsService.update('review-123', 'user-123', { rating: 4 }))
        .rejects.toThrow('You can only update your own reviews');
    });
  });

  describe('delete', () => {
    it('should delete review when user is owner', async () => {
      const review = createMockBookReview({ userId: 'user-123' });
      vi.mocked(bookReviewsRepository.findById).mockResolvedValue(review as any);
      vi.mocked(bookReviewsRepository.delete).mockResolvedValue(undefined as any);

      await bookReviewsService.delete('review-123', 'user-123');

      expect(bookReviewsRepository.delete).toHaveBeenCalledWith('review-123');
    });

    it('should throw NotFoundException when review not found', async () => {
      vi.mocked(bookReviewsRepository.findById).mockResolvedValue(null);

      await expect(bookReviewsService.delete('review-123', 'user-123'))
        .rejects.toThrow('Review not found');
    });

    it('should throw BadRequestException when user is not owner', async () => {
      const review = createMockBookReview({ userId: 'other-user' });
      vi.mocked(bookReviewsRepository.findById).mockResolvedValue(review as any);

      await expect(bookReviewsService.delete('review-123', 'user-123'))
        .rejects.toThrow('You can only delete your own reviews');
    });
  });
});
