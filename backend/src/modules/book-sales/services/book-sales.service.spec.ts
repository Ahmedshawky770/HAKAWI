import { describe, it, expect, vi } from 'vitest';
import { BookSalesService } from './book-sales.service.js';

describe('BookSalesService', () => {
  it('should be defined', () => {
    const service = new BookSalesService();
    expect(service).toBeDefined();
  });
});
