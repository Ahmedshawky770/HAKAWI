import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { PaymentsService } from '../payments/payments.service.ts';
import { RENTAL_CURRENCY, rentalPriceForDays } from '@hakawi/shared-types';
import type { ILibraryRepository } from '../library/interfaces/library-repository.interface.ts';
import { RentalsService } from '../rentals/rentals.service.ts';

import type { Book, CreateBookInput, UpdateBookInput } from './types.ts';
import { BooksService } from './books.service.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

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
  createRental: ReturnType<typeof vi.fn>;
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
      createRental: vi.fn(),
    };

    libraryRepository = {
      // No entitlement by default, so the purchase path proceeds to payment. A case that needs the
      // already-owned refusal overrides this explicitly.
      findByUserAndBook: vi.fn().mockResolvedValue(null),
    };

    booksService = new BooksService(
      booksRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as unknown as TaggedCacheService,
      eventValidatorService as unknown as EventValidatorService,
      paymentsService as unknown as PaymentsService,
      rentalsService as unknown as RentalsService,
      libraryRepository as unknown as ILibraryRepository,
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
        ownerId: undefined,
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

      const result = await booksService.purchase('user-123', 'book-123', 'pm_123');

      expect(result).toEqual({
        paymentId: 'payment-123',
        orderId: 'order-123',
        checkoutUrl: 'https://accept.paymob.com/iframes/pk-123',
        acceptUrl: 'https://accept.paymob.com/accept/pk-123',
        status: 'pending',
      });
      expect(paymentsService.paymobInitializePayment).toHaveBeenCalledWith('user-123', paidBook.price, 'EGP', {
        bookId: 'book-123',
        type: 'purchase',
        paymentMethodId: 'pm_123',
      });

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

  describe('rent', () => {
    it('should rent a book successfully', async () => {
      const rentableBook = { ...mockBook, isFree: false, ownerId: 'other-author' };
      const createdRental = {
        id: 'rental-123',
        userId: 'user-123',
        bookId: 'book-123',
        status: 'active',
        startDate: new Date(),
        endDate: new Date(),
        extendedCount: 0,
        maxExtensions: 3,
        returnedAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(booksRepository.findById).mockResolvedValue(rentableBook);
      vi.mocked(booksRepository.incrementViewCount).mockResolvedValue(undefined);
      // `rent` returns a checkout now, so the payment mock has to resolve one — otherwise the test
      // asserts against `undefined` and passes/fails for the wrong reason.
      vi.mocked(paymentsService.paymobInitializePayment).mockResolvedValue({
        paymentId: 'pay-1',
        checkoutUrl: 'https://accept.paymob.com/iframes/abc',
      });

      // The old assertion was `expect(result).toEqual(createdRental)` — an ACTIVE rental, granted for
      // free, because a search of the rentals module for `payment|amount|price|charge` returned zero
      // hits. `rent` now returns a Paymob checkout and `RentalsEventHandler` creates the rental row
      // when `payment.completed` arrives, so access is always downstream of money.
      const result = await booksService.rent('user-123', 'book-123', 7);

      expect(paymentsService.paymobInitializePayment).toHaveBeenCalledTimes(1);
      const [, amount, currency, metadata] = vi.mocked(paymentsService.paymobInitializePayment).mock.calls[0]!;

      // 7 days at the one shared daily rate, from `@hakawi/shared-types` (Principle #9).
      expect(amount).toBe(rentalPriceForDays(7));
      expect(currency).toBe(RENTAL_CURRENCY);
      expect(metadata).toMatchObject({ bookId: 'book-123', type: 'rental', durationDays: 7 });
      expect(result).toBeDefined();

      // And the access is NOT granted here. That is the whole fix.
      expect(rentalsService.createRental).not.toHaveBeenCalled();
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
