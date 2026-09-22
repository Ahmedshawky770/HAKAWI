import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BookSalesService } from './book-sales.service.js';
import type { BookSalesRepository } from '../repositories/book-sales.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockBookSalesRepository = {
  create: ReturnType<typeof vi.fn>;
};

type MockEventEmitter2 = {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
};

const createMockBookSale = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'sale-123',
  bookId: 'book-123',
  sellerId: 'user-456',
  buyerId: 'user-123',
  salePrice: 9.99,
  currency: 'USD',
  saleType: 'purchase',
  purchasedAt: new Date(),
  ...overrides,
});

describe('BookSalesService', () => {
  let bookSalesService: BookSalesService;
  let bookSalesRepository: MockBookSalesRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    bookSalesRepository = {
      create: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    bookSalesService = new BookSalesService(
      bookSalesRepository as unknown as BookSalesRepository,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('purchase', () => {
    it('should create sale and emit event', async () => {
      const sale = createMockBookSale();
      vi.mocked(bookSalesRepository.create).mockResolvedValue(sale as any);

      const result = await bookSalesService.purchase(
        'book-123',
        'user-123',
        'user-456',
        9.99,
        'USD',
        'purchase',
        'txn-123',
      );

      expect(result).toEqual(sale);
      expect(eventEmitter.emit).toHaveBeenCalledWith('book.purchased', {
        bookId: 'book-123',
        buyerId: 'user-123',
        price: 9.99,
        transactionId: 'txn-123',
      });
    });
  });
});
