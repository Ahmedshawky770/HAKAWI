import { describe, it, expect, vi } from 'vitest';
import { BooksService } from './books.service.js';

describe('BooksService', () => {
  it('should be defined', () => {
    const service = new BooksService();
    expect(service).toBeDefined();
  });
});
