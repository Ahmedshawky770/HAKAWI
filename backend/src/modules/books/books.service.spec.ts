import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { RENTAL_CURRENCY, rentalPriceForDays } from '@hakawi/shared-types';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { PaymentsService } from '../payments/payments.service.ts';
import type { ILibraryRepository } from '../library/interfaces/library-repository.interface.ts';
import { RentalsService } from '../rentals/rentals.service.ts';
import type { Rental } from '../rentals/types.ts';
import { requireValue } from '../../test/helpers/require-value.ts';
import type { PaymobConfig } from '../../config/paymob.config.ts';

import type { Book, CreateBookInput, UpdateBookInput } from './types.ts';
import { BooksService } from './books.service.ts';
import { PurchaseBookDto } from './dto/books.dto.ts';

type MockBooksRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Book | null>>>;
  findByIsbn: ReturnType<typeof vi.fn<(isbn: string) => Promise<Book | null>>>;
  findAll: ReturnType<
    typeof vi.fn<
      (params: {
        page?: number;
        limit?: number;
        categoryId?: string;
        status?: string;
        search?: string;
        author?: string;
        ownerId?: string;
      }) => Promise<{ books: Book[]; total: number }>
    >
  >;
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

type MockEventValidatorService = {
  emit: ReturnType<typeof vi.fn>;
  validateEvent: ReturnType<typeof vi.fn>;
};

type MockPaymentsService = {
  paymobInitializePayment: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
};

type MockRentalsService = {
  // `createRental` was removed with the free-rental door: this service used to grant an ACTIVE rental
  // for the price of one request. `rent` now returns a Paymob checkout, so the mock's subject is the
  // grant question `findActiveRentalForBook` answers, not a method that no longer exists.
  findActiveRentalForBook: ReturnType<typeof vi.fn<(userId: string, bookId: string) => Promise<Rental | null>>>;
};

function createFakeTaggedCache(): {
  store: Map<string, unknown>;
  get: Mock<(namespace: string, key: string) => Promise<unknown>>;
  set: Mock<(namespace: string, key: string, value: unknown, ttl: number, tags?: readonly string[]) => Promise<void>>;
  getOrSet: Mock;
  invalidateKey: Mock<(namespace: string, key: string) => Promise<void>>;
  invalidateTags: Mock<(tags: readonly string[]) => Promise<number>>;
} {
  const store = new Map<string, unknown>();
  const cache = {
    store,
    get: vi.fn(async (namespace: string, key: string) => store.get(`${namespace}:${key}`) ?? null),
    set: vi.fn(async (namespace: string, key: string, value: unknown) => {
      store.set(`${namespace}:${key}`, value);
    }),
    getOrSet: vi.fn(async (options: { namespace: string; key: string; load: () => Promise<unknown> }) => {
      const cacheKey = `${options.namespace}:${options.key}`;
      if (store.has(cacheKey)) {
        return { value: store.get(cacheKey), hit: true };
      }
      const value = await options.load();
      store.set(cacheKey, value);
      return { value, hit: false };
    }),
    invalidateKey: vi.fn(async (namespace: string, key: string) => {
      store.delete(`${namespace}:${key}`);
    }),
    invalidateTags: vi.fn(async () => 0),
  };
  return cache;
}

describe('BooksService', () => {
  let booksService: BooksService;
  let booksRepository: MockBooksRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: ReturnType<typeof createFakeTaggedCache>;
  let eventValidatorService: MockEventValidatorService;
  let paymentsService: MockPaymentsService;
  let rentalsService: MockRentalsService;
  // The library is the authoritative record of what the caller already owns, so the duplicate
  // purchase guard reads it rather than counting payment rows (Principle #9).
  let libraryRepository: { findByUserAndBook: ReturnType<typeof vi.fn> };
  // The Paymob configuration the reader's choice is resolved against, read through the same
  // `paymob` namespace the `PAYMOB_CONFIG` token's own factory reads.
  let configService: { get: ReturnType<typeof vi.fn> };

  const mockBook: Book = {
    id: 'book-123',
    title: 'Test Book',
    // `author` is a DISPLAY NAME. The ownership guards read `ownerId` (migration 0021); the old
    // fixture put a UUID-shaped string in this varchar column, which is a shape the schema cannot
    // produce and is why every guard failed for every caller while the suite stayed green.
    author: 'Ahmad Author',
    ownerId: 'user-123',
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
      findAll:
        vi.fn<
          (params: {
            page?: number;
            limit?: number;
            categoryId?: string;
            status?: string;
            search?: string;
            author?: string;
            ownerId?: string;
          }) => Promise<{ books: Book[]; total: number }>
        >(),
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

    valkeyService = createFakeTaggedCache();

    eventValidatorService = {
      emit: vi.fn(),
      validateEvent: vi.fn(),
    };

    paymentsService = {
      paymobInitializePayment: vi.fn(),
      findById: vi.fn(),
    };

    rentalsService = {
      // No live rental by default: access tests that need one set it explicitly.
      findActiveRentalForBook: vi.fn().mockResolvedValue(null),
    };

    libraryRepository = {
      // No entitlement by default, so the purchase path proceeds to payment. A case that needs the
      // already-owned refusal overrides this explicitly.
      findByUserAndBook: vi.fn().mockResolvedValue(null),
    };

    // No configured method ids by default: the gateway asks the customer which instrument to use,
    // which is the behaviour a deployment without the optional configuration gets.
    configService = {
      get: vi.fn().mockReturnValue(undefined),
    };

    booksService = new BooksService(
      booksRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as unknown as TaggedCacheService,
      eventValidatorService as unknown as EventValidatorService,
      paymentsService as unknown as PaymentsService,
      rentalsService as unknown as RentalsService,
      libraryRepository as unknown as ILibraryRepository,
      configService as unknown as ConfigService,
    );
  });

  describe('create', () => {
    it('should create a book successfully', async () => {
      const createInput: CreateBookInput = {
        title: 'New Book',
        author: 'New Author',
        ownerId: 'user-123',
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
        ownerId: 'user-123',
        isbn: '9781234567890',
      };

      vi.mocked(booksRepository.findByIsbn).mockResolvedValue(mockBook);

      await expect(booksService.create('user-123', createInput)).rejects.toThrow('Book ISBN already exists');
    });
  });

  describe('findById', () => {
    it('should return a book by id', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);

      const result = await booksService.findById('book-123', 'user-123', false);

      expect(result).toEqual(mockBook);
      expect(booksRepository.findById).toHaveBeenCalledWith('book-123');
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.findById('book-999', 'user-123', false)).rejects.toThrow('Book not found');
    });

    it('should throw ForbiddenException when a non-owner reads a draft', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);

      await expect(booksService.findById('book-123', 'other-user', false)).rejects.toThrow(
        'You can only view your own drafts',
      );
    });

    it('should allow the owner to read their own draft', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);

      const result = await booksService.findById('book-123', 'user-123', false);

      expect(result).toEqual(mockBook);
    });

    it('should allow a content administrator to read any draft', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);

      const result = await booksService.findById('book-123', 'other-user', true);

      expect(result).toEqual(mockBook);
    });
  });

  describe('findAll', () => {
    it('should return paginated books', async () => {
      const mockBooks = [mockBook];
      vi.mocked(booksRepository.findAll).mockResolvedValue({ books: mockBooks, total: 1 });

      const result = await booksService.findAll({ page: 1, limit: 20, userId: 'user-123', isAdmin: false });

      expect(result.books).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should pass filters to repository', async () => {
      vi.mocked(booksRepository.findAll).mockResolvedValue({ books: [], total: 0 });

      await booksService.findAll({ page: 2, limit: 10, categoryId: 'cat-123', status: 'published', search: 'test', userId: 'user-123', isAdmin: false });

      expect(booksRepository.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        categoryId: 'cat-123',
        status: 'published',
        search: 'test',
        author: undefined,
        ownerId: undefined,
      });
    });

    it('should scope draft listing to the caller when not an administrator', async () => {
      vi.mocked(booksRepository.findAll).mockResolvedValue({ books: [], total: 0 });

      await booksService.findAll({ status: 'draft', userId: 'user-123', isAdmin: false });

      expect(booksRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'draft', ownerId: 'user-123' }),
      );
    });

    it('should not scope draft listing for a content administrator', async () => {
      vi.mocked(booksRepository.findAll).mockResolvedValue({ books: [], total: 0 });

      await booksService.findAll({ status: 'draft', userId: 'other-user', isAdmin: true });

      expect(booksRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'draft', ownerId: undefined }),
      );
    });

    it('should redact fileUrl for drafts the caller does not own', async () => {
      const draftBook = { ...mockBook, status: 'draft' as const, ownerId: 'someone-else', fileUrl: 'https://cdn.example.com/secret.pdf' };
      vi.mocked(booksRepository.findAll).mockResolvedValue({ books: [draftBook], total: 1 });

      const result = await booksService.findAll({ status: 'draft', userId: 'user-123', isAdmin: false });

      expect(result.books[0].fileUrl).toBeNull();
    });

    it('should not redact fileUrl for the caller\u2019s own drafts', async () => {
      const ownDraft = { ...mockBook, status: 'draft' as const, fileUrl: 'https://cdn.example.com/mine.pdf' };
      vi.mocked(booksRepository.findAll).mockResolvedValue({ books: [ownDraft], total: 1 });

      const result = await booksService.findAll({ status: 'draft', userId: 'user-123', isAdmin: false });

      expect(result.books[0].fileUrl).toBe('https://cdn.example.com/mine.pdf');
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

      await expect(booksService.update('book-999', { title: 'New Title' }, 'user-123')).rejects.toThrow(
        'Book not found',
      );
    });
  });

  /**
   * THE OWNERSHIP GUARDS. Every one of these used to compare `book.author` — a `varchar(255)`
   * display name — against a UUID, so each failed for EVERY caller: no book could be published,
   * archived or deleted, and the self-dealing guards never fired at all.
   */
  describe('ownership guards read ownerId, not the author display name', () => {
    it('should let the OWNER publish, where the author name would never have matched a UUID', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue({ ...mockBook, status: 'draft' as const });
      vi.mocked(booksRepository.update).mockResolvedValue({ ...mockBook, status: 'published' as const });

      await expect(booksService.publish('book-123', 'user-123')).resolves.toBeDefined();
      expect(booksRepository.update).toHaveBeenCalled();
    });

    it('should refuse a NON-owner, and say which path refused them', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue({ ...mockBook, status: 'draft' as const });

      await expect(booksService.publish('book-123', 'someone-else')).rejects.toThrow(
        'You can only publish your own books',
      );
      expect(booksRepository.update).not.toHaveBeenCalled();
    });

    it('should refuse a non-owner on archive and delete too', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue({ ...mockBook, status: 'published' as const });

      await expect(booksService.archive('book-123', 'someone-else')).rejects.toThrow(
        'You can only archive your own books',
      );
      await expect(booksService.delete('book-123', 'someone-else')).rejects.toThrow(
        'You can only delete your own books',
      );
      expect(booksRepository.update).not.toHaveBeenCalled();
      expect(booksRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should refuse to update a book owned by someone else', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);

      await expect(booksService.update('book-123', { title: 'Hijacked' }, 'someone-else')).rejects.toThrow(
        'You can only update your own books',
      );
      expect(booksRepository.update).not.toHaveBeenCalled();
    });

    it('should NAME the unowned case, so an operator files "claim it" rather than "my books are locked"', async () => {
      // A book predating migration 0021 has `ownerId === null`. Rejecting it is right; a message
      // that says only "not yours" sends whoever reads the log looking for the wrong bug.
      vi.mocked(booksRepository.findById).mockResolvedValue({ ...mockBook, ownerId: null });

      await expect(booksService.publish('book-123', 'user-123')).rejects.toThrow(/has no owner/);
      await expect(booksService.publish('book-123', 'user-123')).rejects.toThrow(/claim it/);
    });

    it('should refuse the owner buying their own book, where the name comparison never fired', async () => {
      const ownBook = { ...mockBook, isFree: false, ownerId: 'user-123' };
      vi.mocked(booksRepository.findById).mockResolvedValue(ownBook);

      await expect(booksService.purchase('user-123', 'book-123')).rejects.toThrow('Cannot purchase your own book');
      expect(paymentsService.paymobInitializePayment).not.toHaveBeenCalled();
    });

    it('should refuse the owner renting their own book', async () => {
      const ownBook = { ...mockBook, isFree: false, ownerId: 'user-123' };
      vi.mocked(booksRepository.findById).mockResolvedValue(ownBook);

      await expect(booksService.rent('user-123', 'book-123', 14)).rejects.toThrow('Cannot rent your own book');
      expect(paymentsService.paymobInitializePayment).not.toHaveBeenCalled();
    });

    it('should stamp the owner from the authenticated caller, never from the request body', async () => {
      vi.mocked(booksRepository.create).mockResolvedValue(mockBook);

      // `ownerId` is placed AFTER the spread in `BooksService.create`, and the DTO does not declare
      // it, so a body field cannot set it. The assertion is on the order, which is the guarantee.
      await booksService.create('the-real-caller', {
        title: 'T',
        author: 'A',
        ownerId: 'an-attacker',
      } as never);

      expect(booksRepository.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'the-real-caller' }));
    });
  });

  /**
   * THE DOUBLE-CHARGE GUARD. Ten calls to `purchase` used to create ten payments and ten checkout
   * sessions for one book: the reader is charged ten times for one entitlement.
   */
  describe('purchase is refused when the reader already has the book', () => {
    const paidBook = { ...mockBook, isFree: false, ownerId: 'someone-else' };

    beforeEach(() => {
      vi.mocked(booksRepository.findById).mockResolvedValue(paidBook);
      vi.mocked(booksRepository.incrementViewCount).mockResolvedValue(undefined);
    });

    it('should refuse when the library already records ownership', async () => {
      libraryRepository.findByUserAndBook.mockResolvedValue({
        id: 'lib-1',
        userId: 'user-123',
        bookId: 'book-123',
        rentalId: null,
        status: 'owned',
        addedAt: new Date(),
        lastAccessedAt: null,
      });

      await expect(booksService.purchase('user-123', 'book-123')).rejects.toThrow('You already own this book');
      expect(paymentsService.paymobInitializePayment).not.toHaveBeenCalled();
    });

    it('should refuse a second purchase while a rental is active', async () => {
      // Paying for a book you are already renting leaves the rental AND adds the entitlement.
      libraryRepository.findByUserAndBook.mockResolvedValue({
        id: 'lib-1',
        userId: 'user-123',
        bookId: 'book-123',
        rentalId: 'rental-1',
        status: 'rented',
        addedAt: new Date(),
        lastAccessedAt: null,
      });

      await expect(booksService.purchase('user-123', 'book-123')).rejects.toThrow(
        'You already have this book on rental',
      );
      expect(paymentsService.paymobInitializePayment).not.toHaveBeenCalled();
    });

    it('should refuse a rental when the reader already owns it', async () => {
      libraryRepository.findByUserAndBook.mockResolvedValue({
        id: 'lib-1',
        userId: 'user-123',
        bookId: 'book-123',
        rentalId: null,
        status: 'owned',
        addedAt: new Date(),
        lastAccessedAt: null,
      });

      await expect(booksService.rent('user-123', 'book-123', 14)).rejects.toThrow('You already own this book');
      expect(paymentsService.paymobInitializePayment).not.toHaveBeenCalled();
    });

    it('should charge once when the reader does not have the book', async () => {
      libraryRepository.findByUserAndBook.mockResolvedValue(null);
      vi.mocked(paymentsService.paymobInitializePayment).mockResolvedValue({
        paymentId: 'pay-1',
        orderId: 'order-1',
        paymentKey: 'pk',
        iframeUrl: 'https://paymob.test/iframes/pk',
        acceptUrl: 'https://paymob.test/accept/pk',
        status: 'pending',
      });

      await booksService.purchase('user-123', 'book-123');

      expect(paymentsService.paymobInitializePayment).toHaveBeenCalledTimes(1);
    });
  });

  describe('rent refuses a duration the product does not offer', () => {
    beforeEach(() => {
      vi.mocked(booksRepository.findById).mockResolvedValue({ ...mockBook, isFree: false, ownerId: 'other' });
      libraryRepository.findByUserAndBook.mockResolvedValue(null);
    });

    it('should refuse a duration outside RENTAL_DURATION_DAYS', async () => {
      await expect(booksService.rent('user-123', 'book-123', 15)).rejects.toThrow('Invalid rental duration');
      expect(paymentsService.paymobInitializePayment).not.toHaveBeenCalled();
    });

    it('should refuse to rent a FREE book, which is claimed instead', async () => {
      // An active rental IS access. Granting it through the paid path would create a rental row for a
      // book the library grants for nothing.
      vi.mocked(booksRepository.findById).mockResolvedValue({ ...mockBook, isFree: true, ownerId: 'other' });

      await expect(booksService.rent('user-123', 'book-123', 14)).rejects.toThrow('free');
      expect(paymentsService.paymobInitializePayment).not.toHaveBeenCalled();
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
      expect(booksRepository.update).toHaveBeenCalledWith('book-123', expect.objectContaining({ status: 'archived' }));
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

  // WHY THERE IS NO `incrementDownloadCount` SUITE. The service method it tested was deleted with the
  // download work: `recordDownload` is now the single path that bumps the counter, and it does so
  // only after the entitlement check. Keeping the suite would have tested a method that no longer
  // exists — the counter's coverage lives in `recordDownload` below.

  describe('recordDownload', () => {
    /**
     * The file of a paid book is an entitlement, not public content. `POST /books/:id/download`
     * used to authenticate the caller and hand over the URL of any book in the catalogue, paid or
     * not, because nothing on the route asked what the caller had acquired. These tests hold the
     * three facts that confer access in place.
     */
    it('hands the file to anyone when the book is free, without consulting the library', async () => {
      const freeBook = { ...mockBook, isFree: true };
      vi.mocked(booksRepository.findById).mockResolvedValue(freeBook);
      vi.mocked(booksRepository.incrementDownloadCount).mockResolvedValue(undefined);

      const book = await booksService.recordDownload('book-123', 'user-123');

      expect(book.fileUrl).toBe(freeBook.fileUrl);
      expect(booksRepository.incrementDownloadCount).toHaveBeenCalledWith('book-123');
    });

    it('hands the file to a reader who owns the book', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(booksRepository.incrementDownloadCount).mockResolvedValue(undefined);
      vi.mocked(libraryRepository.findByUserAndBook).mockResolvedValue({
        id: 'library-1',
        userId: 'user-123',
        bookId: 'book-123',
        rentalId: null,
        status: 'owned',
        addedAt: new Date(),
        lastAccessedAt: null,
      });

      await expect(booksService.recordDownload('book-123', 'user-123')).resolves.toMatchObject({ id: 'book-123' });
      expect(booksRepository.incrementDownloadCount).toHaveBeenCalledWith('book-123');
    });

    it('hands the file to a reader with a rental that is still inside its dates', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(booksRepository.incrementDownloadCount).mockResolvedValue(undefined);
      vi.mocked(libraryRepository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(rentalsService.findActiveRentalForBook).mockResolvedValue({
        id: 'rental-1',
        userId: 'user-123',
        bookId: 'book-123',
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        extendedCount: 0,
        maxExtensions: 2,
        returnedAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(booksService.recordDownload('book-123', 'user-123')).resolves.toMatchObject({ id: 'book-123' });
    });

    it('refuses the file of a paid book to a reader who has not acquired it, and counts nothing', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(libraryRepository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(rentalsService.findActiveRentalForBook).mockResolvedValue(null);

      await expect(booksService.recordDownload('book-123', 'user-123')).rejects.toThrow(
        'You do not have access to this book. Purchase it or rent it to add it to your library.',
      );
      expect(booksRepository.incrementDownloadCount).not.toHaveBeenCalled();
    });

    it('refuses a lapsed rental, because access follows the end date and not the status word', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(libraryRepository.findByUserAndBook).mockResolvedValue(null);
      // The service answers this, so an `active` row past its end date never reaches the check —
      // but the guard itself is also pinned here in case the two ever drift apart.
      vi.mocked(rentalsService.findActiveRentalForBook).mockResolvedValue(null);

      await expect(booksService.recordDownload('book-123', 'user-123')).rejects.toThrow(
        'You do not have access to this book',
      );
    });

    it('refuses the file when a rented SHELF ROW outlived its rental', async () => {
      // The defect this pins: access used to return on the mere existence of a library row, so a
      // `rented` row whose rental had lapsed kept handing out the paid book — nothing retires a
      // lapsed rental on a clock (`checkAndExpireOverdue` has no caller), and the stale row also
      // blocked the reader from buying or re-renting the book with a `ConflictException`.
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(libraryRepository.findByUserAndBook).mockResolvedValue({
        id: 'lib-rented-stale',
        userId: 'user-123',
        bookId: 'book-123',
        rentalId: 'rental-1',
        status: 'rented',
        addedAt: new Date(),
        lastAccessedAt: new Date(),
      });
      vi.mocked(rentalsService.findActiveRentalForBook).mockResolvedValue(null);

      await expect(booksService.recordDownload('book-123', 'user-123')).rejects.toThrow(
        'You do not have access to this book',
      );
      expect(booksRepository.incrementDownloadCount).not.toHaveBeenCalled();
    });

    it('still hands the file to an owned row, whatever the rental store says', async () => {
      // The other half of the same fix: an `owned` row is a permanent entitlement and is trusted on
      // its own, without a rental lookup — so tightening the rental check must not start 403ing
      // purchases.
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(libraryRepository.findByUserAndBook).mockResolvedValue({
        id: 'library-1',
        userId: 'user-123',
        bookId: 'book-123',
        rentalId: null,
        status: 'owned',
        addedAt: new Date(),
        lastAccessedAt: null,
      });
      vi.mocked(rentalsService.findActiveRentalForBook).mockResolvedValue(null);

      await expect(booksService.recordDownload('book-123', 'user-123')).resolves.toMatchObject({ id: 'book-123' });
    });

    it('refuses a deleted book before any entitlement question', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue({ ...mockBook, deletedAt: new Date() });

      await expect(booksService.recordDownload('book-123', 'user-123')).rejects.toThrow('Book not found');
      expect(libraryRepository.findByUserAndBook).not.toHaveBeenCalled();
    });
  });

  describe('purchase', () => {
    it('should purchase a book successfully', async () => {
      const paidBook = { ...mockBook, isFree: false, ownerId: 'other-author' };
      // The gateway's answer, which is what the service now returns. `purchase` used to return the
      // whole `payments` ROW, so the client got no URL at all: the frontend's schema asked for
      // `paymobUrl`, Zod rejected the response, and the buy flow errored on every attempt without
      // ever sending anyone to Paymob.
      const paymentResult = {
        paymentId: 'payment-123',
        orderId: 'order-123',
        paymentKey: 'pk-123',
        iframeUrl: 'https://accept.paymob.com/iframes/pk-123',
        acceptUrl: 'https://accept.paymob.com/accept/pk-123',
        status: 'pending',
      };

      vi.mocked(booksRepository.findById).mockResolvedValue(paidBook);
      vi.mocked(booksRepository.incrementViewCount).mockResolvedValue(undefined);
      vi.mocked(paymentsService.paymobInitializePayment).mockResolvedValue(paymentResult);

      const result = await booksService.purchase('user-123', 'book-123', 'card');

      expect(result).toEqual({
        paymentId: 'payment-123',
        orderId: 'order-123',
        checkoutUrl: 'https://accept.paymob.com/iframes/pk-123',
        acceptUrl: 'https://accept.paymob.com/accept/pk-123',
        status: 'pending',
      });
      expect(paymentsService.paymobInitializePayment).toHaveBeenCalledWith(
        'user-123',
        paidBook.price,
        'EGP',
        {
          bookId: 'book-123',
          type: 'purchase',
          // The SEMANTIC choice is what the payment record keeps.
          paymentMethod: 'card',
        },
        // No configured method id in this deployment, so nothing is said to the gateway about the
        // instrument — which is Paymob's own "let the customer choose" case.
        undefined,
      );

      // The payment row is no longer read back: the checkout IS the response, and a second lookup
      // would only re-read what the gateway just told us.
      expect(paymentsService.findById).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.purchase('user-123', 'book-999', undefined)).rejects.toThrow('Book not found');
    });

    it('should throw ForbiddenException when purchasing own book', async () => {
      const ownBook = { ...mockBook, ownerId: 'user-123' };
      vi.mocked(booksRepository.findById).mockResolvedValue(ownBook);

      await expect(booksService.purchase('user-123', 'book-123', undefined)).rejects.toThrow(
        'Cannot purchase your own book',
      );
    });

    it('should throw BadRequestException when book is free', async () => {
      const freeBook = { ...mockBook, isFree: true, ownerId: 'other-author' };
      vi.mocked(booksRepository.findById).mockResolvedValue(freeBook);

      await expect(booksService.purchase('user-123', 'book-123', undefined)).rejects.toThrow(
        'This book is free, no purchase needed',
      );
    });
  });

  /**
   * THE READER'S CHOICE OF INSTRUMENT, AND WHERE IT ENDS UP.
   *
   * THE DEFECT THIS HOLDS STILL. The reader picked "بطاقة ائتمانية" or "محفظة إلكترونية" on the
   * checkout panel, the choice was stored as opaque metadata, and the Paymob frame asked which
   * instrument to use anyway — the UI promised a choice it did not deliver. The choice has to
   * become this merchant's own Paymob method id on the way to the gateway, or it is decoration.
   */
  describe("the reader's choice of instrument", () => {
    const paidBook = { ...mockBook, isFree: false, ownerId: 'other-author' };

    beforeEach(() => {
      vi.mocked(booksRepository.findById).mockResolvedValue(paidBook);
      vi.mocked(booksRepository.incrementViewCount).mockResolvedValue(undefined);
      vi.mocked(paymentsService.paymobInitializePayment).mockResolvedValue({
        paymentId: 'payment-123',
        orderId: 'order-123',
        paymentKey: 'pk-123',
        iframeUrl: 'https://accept.paymob.com/iframes/pk-123',
        acceptUrl: 'https://accept.paymob.com/accept/pk-123',
        status: 'pending',
      });
    });

    const configure = (config: Partial<PaymobConfig>): void => {
      configService.get.mockReturnValue(config);
    };

    it('sends the configured card id to the gateway when the reader chose the card', async () => {
      configure({ cardPaymentMethodId: '7', walletPaymentMethodId: '9' });

      await booksService.purchase('user-123', 'book-123', 'card');

      expect(paymentsService.paymobInitializePayment).toHaveBeenCalledWith(
        'user-123',
        paidBook.price,
        'EGP',
        expect.objectContaining({ paymentMethod: 'card' }),
        '7',
      );
    });

    it('sends the configured wallet id to the gateway when the reader chose the wallet', async () => {
      configure({ cardPaymentMethodId: '7', walletPaymentMethodId: '9' });

      await booksService.purchase('user-123', 'book-123', 'wallet');

      expect(paymentsService.paymobInitializePayment).toHaveBeenCalledWith(
        'user-123',
        paidBook.price,
        'EGP',
        expect.objectContaining({ paymentMethod: 'wallet' }),
        '9',
      );
    });

    it('sends NOTHING to the gateway when this deployment has configured no method id', async () => {
      // The deployment has not told the gateway which instrument to use, so the gateway asks the
      // customer inside the payment frame — the behaviour the product had before the choice
      // existed. The purchase must NOT fail over an optional configuration value.
      configure({});

      await booksService.purchase('user-123', 'book-123', 'card');

      expect(paymentsService.paymobInitializePayment).toHaveBeenCalledWith(
        'user-123',
        paidBook.price,
        'EGP',
        expect.objectContaining({ paymentMethod: 'card' }),
        undefined,
      );
    });

    it('sends NOTHING to the gateway when the reader chose no instrument at all', async () => {
      configure({ cardPaymentMethodId: '7', walletPaymentMethodId: '9' });

      await booksService.purchase('user-123', 'book-123');

      const call = requireValue(
        vi.mocked(paymentsService.paymobInitializePayment).mock.calls[0],
        'paymobInitializePayment call args',
      );
      expect(call[4]).toBeUndefined();
      // And the record says nothing about an instrument either, rather than claiming one.
      expect(call[3]).not.toHaveProperty('paymentMethod');
    });

    it('keeps the SEMANTIC choice in the payment record and the numeric id out of it', async () => {
      // The record is what an analyst reconciles on, so it carries the reader's words. The gateway's
      // id is a fact about this merchant's dashboard and never reaches the stored metadata.
      configure({ cardPaymentMethodId: '7', walletPaymentMethodId: '9' });

      await booksService.purchase('user-123', 'book-123', 'wallet');

      const call = requireValue(
        vi.mocked(paymentsService.paymobInitializePayment).mock.calls[0],
        'paymobInitializePayment call args',
      );
      expect(call[3]).toEqual({ bookId: 'book-123', type: 'purchase', paymentMethod: 'wallet' });
    });
  });

  /**
   * THE PURCHASE BODY, THROUGH THE DTO'S OWN DECORATORS.
   *
   * This lives here rather than in a separate file because the books module has no DTO spec of its
   * own, and the field under test is the one this service reads.
   */
  describe('PurchaseBookDto', () => {
    const messagesFor = async (body: Record<string, unknown>): Promise<string[]> => {
      const dto = plainToInstance(PurchaseBookDto, body);
      const errors = await validate(dto);
      return errors.flatMap((error) => Object.values(error.constraints ?? {}));
    };

    it('accepts the two instruments the reader can choose', async () => {
      expect(await messagesFor({ paymentMethod: 'card' })).toEqual([]);
      expect(await messagesFor({ paymentMethod: 'wallet' })).toEqual([]);
    });

    it('refuses anything else, including a gateway identifier', async () => {
      // The field used to be a free-form string, so any handle a caller could invent was accepted
      // and stored as metadata. The vocabulary is closed now.
      expect(await messagesFor({ paymentMethod: 'pm_123' })).not.toEqual([]);
      expect(await messagesFor({ paymentMethod: 'bank-transfer' })).not.toEqual([]);
      expect(await messagesFor({ paymentMethod: 7 })).not.toEqual([]);
    });

    it('still accepts a body with no choice in it', async () => {
      // The choice is optional: a reader who never picked one still gets the gateway's own
      // instrument question.
      expect(await messagesFor({})).toEqual([]);
    });

    it('refuses a choice that is null rather than treating it as no choice', async () => {
      // `@IsOptional` skips the check for `null` as well as for `undefined`, so a body that
      // said `{"paymentMethod": null}` passed validation and stored a `null` — which is
      // neither the word the reader chose nor the absence of a choice.
      expect(await messagesFor({ paymentMethod: null })).not.toEqual([]);
    });

    it('no longer declares the retired field', () => {
      // The field was accepted and ignored for one release, so that a client that had not
      // been redeployed yet would keep working. The release has passed, and the field is
      // gone.
      //
      // The REFUSAL is the global validation pipe's, not the DTO's: `forbidNonWhitelisted`
      // is what answers a body that carries a property the DTO does not declare, and
      // class-validator on its own never sees that. So the refusal is asserted where the
      // pipe runs — `common/validation/retired-fields.spec.ts` and the rentals controller
      // spec, which installs the production pipe.
      expect('paymentMethodId' in new PurchaseBookDto()).toBe(false);
    });
  });

  describe('rent', () => {
    it('should rent a book successfully', async () => {
      const rentableBook = { ...mockBook, isFree: false, ownerId: 'other-author' };

      vi.mocked(booksRepository.findById).mockResolvedValue(rentableBook);
      vi.mocked(booksRepository.incrementViewCount).mockResolvedValue(undefined);
      // `rent` returns a checkout now, so the payment mock has to resolve one in the shape
      // `PaymobCheckoutResponse` actually has — `iframeUrl`, which `toCheckoutResponse` maps to
      // `checkoutUrl`. An object that already said `checkoutUrl` would map to `undefined` and the
      // response assertions below would pass or fail for the wrong reason.
      vi.mocked(paymentsService.paymobInitializePayment).mockResolvedValue({
        paymentId: 'pay-1',
        orderId: 'order-1',
        paymentKey: 'pk-1',
        iframeUrl: 'https://accept.paymob.com/iframes/abc',
        acceptUrl: 'https://accept.paymob.com/accept/abc',
        status: 'pending',
      });

      // The old assertion was `expect(result).toEqual(createdRental)` — an ACTIVE rental, granted for
      // free, because a search of the rentals module for `payment|amount|price|charge` returned zero
      // hits. `rent` now returns a Paymob checkout and `RentalsEventHandler` creates the rental row
      // when `payment.completed` arrives, so access is always downstream of money.
      const result = await booksService.rent('user-123', 'book-123', 7);

      expect(paymentsService.paymobInitializePayment).toHaveBeenCalledTimes(1);
      const [, amount, currency, metadata] = requireValue(
        vi.mocked(paymentsService.paymobInitializePayment).mock.calls[0],
        'paymobInitializePayment call args',
      );

      // 7 days at the one shared daily rate, from `@hakawi/shared-types` (Principle #9).
      expect(amount).toBe(rentalPriceForDays(7));
      expect(currency).toBe(RENTAL_CURRENCY);
      expect(metadata).toMatchObject({ bookId: 'book-123', type: 'rental', durationDays: 7 });
      expect(result).toBeDefined();

      // And the access is NOT granted here. That is the whole fix: an ACTIVE rental used to come back
      // from this call. What proves it now is the checkout itself — a payment request whose metadata
      // names the book, the type and the duration — asserted above. A rental only exists once
      // `payment.completed` arrives, which `RentalsEventHandler` owns and its own spec pins.
      expect(result).toMatchObject({ checkoutUrl: expect.any(String) });
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.rent('user-123', 'book-999', 7)).rejects.toThrow('Book not found');
    });

    it('should throw ForbiddenException when renting own book', async () => {
      const ownBook = { ...mockBook, ownerId: 'user-123' };
      vi.mocked(booksRepository.findById).mockResolvedValue(ownBook);

      await expect(booksService.rent('user-123', 'book-123', 7)).rejects.toThrow('Cannot rent your own book');
    });
  });
});
