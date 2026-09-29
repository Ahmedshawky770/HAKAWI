import { describe, it, expect, beforeEach, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { PaymentsService } from '../payments/payments.service.ts';
import { RentalsService } from '../rentals/rentals.service.ts';

import type { Book, CreateBookInput, UpdateBookInput } from './types.ts';
import type { IBooksRepository } from './interfaces/books-repository.interface.ts';
import { BooksService } from './books.service.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockBooksRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Book | null>>>;
  findByIsbn: ReturnType<typeof vi.fn<(isbn: string) => Promise<Book | null>>>;
  findAll: ReturnType<typeof vi.fn<(params: { page?: number; limit?: number; categoryId?: string; status?: string; search?: string; author?: string }) => Promise<{ books: Book[]; total: number }>>>;
  create: ReturnType<typeof vi.fn<(data: CreateBookInput) => Promise<Book>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: UpdateBookInput) => Promise<Book>>>;
  softDelete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  incrementViewCount: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  incrementDownloadCount: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  findByCategory: ReturnType<typeof vi.fn<(categoryId: string) => Promise<Book[]>>>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

type MockValkeyService = {
  exists: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

type MockEventValidatorService = {
  emit: ReturnType<typeof vi.fn>;
  validateEvent: ReturnType<typeof vi.fn>;
};

type MockPaymentsService = {
  paymobInitializePayment: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
};

type MockRentalsService = {
  createRental: ReturnType<typeof vi.fn>;
};

describe('BooksService', () => {
  let booksService: BooksService;
  let booksRepository: MockBooksRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: MockValkeyService;
  let eventValidatorService: MockEventValidatorService;
  let paymentsService: MockPaymentsService;
  let rentalsService: MockRentalsService;

  const mockBook: Book = {
    id: 'book-123',
    title: 'Test Book',
    author: 'user-123',
    description: 'Test description',
    coverImage: 'https://example.com/cover.jpg',
    isbn: '9781234567890',
    publisher: 'Test Publisher',
    publishDate: new Date('2024-01-01'),
    language: 'en',
    pageCount: 300,
    fileUrl: 'https://example.com/book.pdf',
    fileType: 'pdf',
    price: 1000,
    isFree: false,
    status: 'draft',
    categoryId: null,
    viewCount: 0,
    likeCount: 0,
    downloadCount: 0,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    booksRepository = {
      findById: vi.fn<(id: string) => Promise<Book | null>>(),
      findByIsbn: vi.fn<(isbn: string) => Promise<Book | null>>(),
      findAll: vi.fn<(params: { page?: number; limit?: number; categoryId?: string; status?: string; search?: string; author?: string }) => Promise<{ books: Book[]; total: number }>>(),
      create: vi.fn<(data: CreateBookInput) => Promise<Book>>(),
      update: vi.fn<(id: string, data: UpdateBookInput) => Promise<Book>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
      incrementViewCount: vi.fn<(id: string) => Promise<void>>(),
      incrementDownloadCount: vi.fn<(id: string) => Promise<void>>(),
      findByCategory: vi.fn<(categoryId: string) => Promise<Book[]>>(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    valkeyService = {
      exists: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
    };

    eventValidatorService = {
      emit: vi.fn(),
      validateEvent: vi.fn(),
    };

    paymentsService = {
      paymobInitializePayment: vi.fn(),
      findById: vi.fn(),
    };

    rentalsService = {
      createRental: vi.fn(),
    };

    booksService = new BooksService(
      booksRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as ValkeyService,
      eventValidatorService as unknown as EventValidatorService,
      paymentsService as unknown as PaymentsService,
      rentalsService as unknown as RentalsService,
    );
  });

  describe('create', () => {
    it('should create a book successfully', async () => {
      const createInput: CreateBookInput = {
        title: 'New Book',
        author: 'New Author',
        description: 'A great book',
        isbn: '9781234567891',
      };

      vi.mocked(booksRepository.findByIsbn).mockResolvedValue(null);
      vi.mocked(booksRepository.create).mockResolvedValue({
        ...mockBook,
        ...createInput,
        id: 'book-456',
      });

      const result = await booksService.create('user-123', createInput);

      expect(result).toHaveProperty('id', 'book-456');
      expect(result.title).toBe('New Book');
      expect(result.status).toBe('draft');
      expect(booksRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Book',
          author: 'New Author',
          status: 'draft',
        }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('book.created', expect.any(Object));
    });

    it('should throw ConflictException when ISBN already exists', async () => {
      const createInput: CreateBookInput = {
        title: 'New Book',
        author: 'New Author',
        isbn: '9781234567890',
      };

      vi.mocked(booksRepository.findByIsbn).mockResolvedValue(mockBook);

      await expect(booksService.create('user-123', createInput)).rejects.toThrow('Book ISBN already exists');
    });
  });

  describe('findById', () => {
    it('should return a book by id', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(valkeyService.get).mockResolvedValue(null);

      const result = await booksService.findById('book-123');

      expect(result).toEqual(mockBook);
      expect(booksRepository.findById).toHaveBeenCalledWith('book-123');
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.findById('book-999')).rejects.toThrow('Book not found');
    });
  });

  describe('findAll', () => {
    it('should return paginated books', async () => {
      const mockBooks = [mockBook];
      vi.mocked(booksRepository.findAll).mockResolvedValue({ books: mockBooks, total: 1 });

      const result = await booksService.findAll({ page: 1, limit: 20 });

      expect(result.books).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should pass filters to repository', async () => {
      vi.mocked(booksRepository.findAll).mockResolvedValue({ books: [], total: 0 });

      await booksService.findAll({ page: 2, limit: 10, categoryId: 'cat-123', status: 'published', search: 'test' });

      expect(booksRepository.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        categoryId: 'cat-123',
        status: 'published',
        search: 'test',
        author: undefined,
      });
    });
  });

  describe('update', () => {
    it('should update a book successfully', async () => {
      const updateInput: UpdateBookInput = {
        title: 'Updated Title',
        description: 'Updated description',
      };

      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(booksRepository.update).mockResolvedValue({
        ...mockBook,
        ...updateInput,
      });

      const result = await booksService.update('book-123', updateInput, 'user-123');

      expect(result.title).toBe('Updated Title');
      expect(result.description).toBe('Updated description');
      expect(booksRepository.update).toHaveBeenCalledWith('book-123', expect.objectContaining(updateInput));
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.update('book-999', { title: 'New Title' }, 'user-123')).rejects.toThrow('Book not found');
    });
  });

  describe('publish', () => {
    it('should publish a draft book', async () => {
      const draftBook = { ...mockBook, status: 'draft' as const, publishDate: null };
      const publishedBook = { ...draftBook, status: 'published' as const, publishDate: new Date() };

      vi.mocked(booksRepository.findById).mockResolvedValue(draftBook);
      vi.mocked(booksRepository.update).mockResolvedValue(publishedBook);

      const result = await booksService.publish('book-123', 'user-123');

      expect(result.status).toBe('published');
      expect(result.publishDate).not.toBeNull();
      expect(booksRepository.update).toHaveBeenCalledWith(
        'book-123',
        expect.objectContaining({ status: 'published', publishDate: expect.any(Date) }),
      );
    });

    it('should throw ForbiddenException when book is already published', async () => {
      const publishedBook = { ...mockBook, status: 'published' as const };
      vi.mocked(booksRepository.findById).mockResolvedValue(publishedBook);

      await expect(booksService.publish('book-123', 'user-123')).rejects.toThrow('Book is already published');
    });

    it('should throw ForbiddenException when book is archived', async () => {
      const archivedBook = { ...mockBook, status: 'archived' as const };
      vi.mocked(booksRepository.findById).mockResolvedValue(archivedBook);

      await expect(booksService.publish('book-123', 'user-123')).rejects.toThrow('Cannot publish an archived book');
    });
  });

  describe('archive', () => {
    it('should archive a published book', async () => {
      const publishedBook = { ...mockBook, status: 'published' as const };
      const archivedBook = { ...publishedBook, status: 'archived' as const };

      vi.mocked(booksRepository.findById).mockResolvedValue(publishedBook);
      vi.mocked(booksRepository.update).mockResolvedValue(archivedBook);

      const result = await booksService.archive('book-123', 'user-123');

      expect(result.status).toBe('archived');
      expect(booksRepository.update).toHaveBeenCalledWith(
        'book-123',
        expect.objectContaining({ status: 'archived' }),
      );
    });

    it('should throw ForbiddenException when book is already archived', async () => {
      const archivedBook = { ...mockBook, status: 'archived' as const };
      vi.mocked(booksRepository.findById).mockResolvedValue(archivedBook);

      await expect(booksService.archive('book-123', 'user-123')).rejects.toThrow('Book is already archived');
    });
  });

  describe('delete', () => {
    it('should soft delete a book', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(booksRepository.softDelete).mockResolvedValue(undefined);

      await booksService.delete('book-123', 'user-123');

      expect(booksRepository.softDelete).toHaveBeenCalledWith('book-123');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('book.deleted', expect.any(Object));
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.delete('book-999', 'user-123')).rejects.toThrow('Book not found');
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(booksRepository.incrementViewCount).mockResolvedValue(undefined);

      await booksService.incrementViewCount('book-123');

      expect(booksRepository.incrementViewCount).toHaveBeenCalledWith('book-123');
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.incrementViewCount('book-999')).rejects.toThrow('Book not found');
    });
  });

  describe('incrementDownloadCount', () => {
    it('should increment download count', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(booksRepository.incrementDownloadCount).mockResolvedValue(undefined);

      await booksService.incrementDownloadCount('book-123');

      expect(booksRepository.incrementDownloadCount).toHaveBeenCalledWith('book-123');
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.incrementDownloadCount('book-999')).rejects.toThrow('Book not found');
    });
  });

  describe('purchase', () => {
    it('should purchase a book successfully', async () => {
      const paidBook = { ...mockBook, isFree: false, author: 'other-author' };
      const paymentResult = { paymentId: 'payment-123', orderId: 'order-123', paymobUrl: 'https://paymob.com/pay' };
      const createdPayment = { id: 'payment-123', userId: 'user-123', amount: 1000, currency: 'EGP', status: 'pending', paymentMethod: 'paymob', paymobOrderId: null, paymobPaymentId: null, paymobTransactionId: null, metadata: null, description: null, deletedAt: null, createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01') };

      vi.mocked(booksRepository.findById).mockResolvedValue(paidBook);
      vi.mocked(booksRepository.incrementViewCount).mockResolvedValue(undefined);
      vi.mocked(paymentsService.paymobInitializePayment).mockResolvedValue(paymentResult);
      vi.mocked(paymentsService.findById).mockResolvedValue(createdPayment);

      const result = await booksService.purchase('user-123', 'book-123', 'pm_123');

      expect(result).toEqual(createdPayment);
      expect(paymentsService.paymobInitializePayment).toHaveBeenCalledWith('user-123', paidBook.price, 'EGP', { bookId: 'book-123', type: 'purchase', paymentMethodId: 'pm_123' });
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.purchase('user-123', 'book-999', undefined)).rejects.toThrow('Book not found');
    });

    it('should throw ForbiddenException when purchasing own book', async () => {
      const ownBook = { ...mockBook, author: 'user-123' };
      vi.mocked(booksRepository.findById).mockResolvedValue(ownBook);

      await expect(booksService.purchase('user-123', 'book-123', undefined)).rejects.toThrow('Cannot purchase your own book');
    });

    it('should throw BadRequestException when book is free', async () => {
      const freeBook = { ...mockBook, isFree: true, author: 'other-author' };
      vi.mocked(booksRepository.findById).mockResolvedValue(freeBook);

      await expect(booksService.purchase('user-123', 'book-123', undefined)).rejects.toThrow('This book is free, no purchase needed');
    });
  });

  describe('rent', () => {
    it('should rent a book successfully', async () => {
      const rentableBook = { ...mockBook, isFree: false, author: 'other-author' };
      const createdRental = { id: 'rental-123', userId: 'user-123', bookId: 'book-123', status: 'active', startDate: new Date(), endDate: new Date(), extendedCount: 0, maxExtensions: 3, returnedAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date() };

      vi.mocked(booksRepository.findById).mockResolvedValue(rentableBook);
      vi.mocked(booksRepository.incrementViewCount).mockResolvedValue(undefined);
      vi.mocked(rentalsService.createRental).mockResolvedValue(createdRental);

      const result = await booksService.rent('user-123', 'book-123', 7);

      expect(result).toEqual(createdRental);
      expect(rentalsService.createRental).toHaveBeenCalledWith('user-123', { bookId: 'book-123', durationDays: 7 });
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.rent('user-123', 'book-999', 7)).rejects.toThrow('Book not found');
    });

    it('should throw ForbiddenException when renting own book', async () => {
      const ownBook = { ...mockBook, author: 'user-123' };
      vi.mocked(booksRepository.findById).mockResolvedValue(ownBook);

      await expect(booksService.rent('user-123', 'book-123', 7)).rejects.toThrow('Cannot rent your own book');
    });
  });
});
