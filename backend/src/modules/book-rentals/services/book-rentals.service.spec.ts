import { describe, it, expect, vi } from 'vitest';
import { BookRentalsService } from './book-rentals.service.js';

describe('BookRentalsService', () => {
  it('should be defined', () => {
    const service = new BookRentalsService();
    expect(service).toBeDefined();
  });
});
