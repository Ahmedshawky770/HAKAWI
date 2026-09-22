import { describe, it, expect, vi } from 'vitest';
import { BookReviewsService } from './book-reviews.service.js';

describe('BookReviewsService', () => {
  it('should be defined', () => {
    const service = new BookReviewsService();
    expect(service).toBeDefined();
  });
});
