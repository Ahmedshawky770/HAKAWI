import { describe, it, expect, beforeEach, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import type { IBooksRepository } from '../books/interfaces/books-repository.interface.ts';
import { LibraryService } from './library.service.ts';
import type { ILibraryRepository } from './interfaces/library-repository.interface.ts';
import type { LibraryItem } from './types.ts';
import type { LibraryQuery } from './types.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockLibraryRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<LibraryItem | null>>>;
  findByUser: ReturnType<
    typeof vi.fn<
      (
        userId: string,
        params: { status?: string; page?: number; limit?: number },
      ) => Promise<{ items: LibraryItem[]; total: number }>
    >
  >;
  findByUserAndBook: ReturnType<typeof vi.fn<(userId: string, bookId: string) => Promise<LibraryItem | null>>>;
  create: ReturnType<
    typeof vi.fn<
      (data: { userId: string; bookId: string; rentalId?: string | null; status?: string }) => Promise<LibraryItem>
    >
  >;
  update: ReturnType<typeof vi.fn<(id: string, data: Partial<LibraryItem>) => Promise<LibraryItem>>>;
  delete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  countByUser: ReturnType<typeof vi.fn<(userId: string) => Promise<number>>>;
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

describe('LibraryService', () => {
  let libraryService: LibraryService;
  let libraryRepository: MockLibraryRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: MockValkeyService;
  // The books module's own interface: `claimFreeBook` must read `is_free` from the authoritative
  // source rather than trusting the request, and must not query the books table itself.
  let booksRepository: { findById: ReturnType<typeof vi.fn> };
  let eventValidatorService: MockEventValidatorService;

  const mockLibraryItem: LibraryItem = {
    id: 'library-123',
    userId: 'user-123',
    bookId: 'book-123',
    rentalId: null,
    status: 'owned',
    addedAt: new Date('2024-01-01'),
    lastAccessedAt: null,
  };

  beforeEach(() => {
    libraryRepository = {
      findById: vi.fn<(id: string) => Promise<LibraryItem | null>>(),
      findByUser:
        vi.fn<
          (
            userId: string,
            params: { status?: string; page?: number; limit?: number },
          ) => Promise<{ items: LibraryItem[]; total: number }>
        >(),
      findByUserAndBook: vi.fn<(userId: string, bookId: string) => Promise<LibraryItem | null>>(),
      create:
        vi.fn<
          (data: { userId: string; bookId: string; rentalId?: string | null; status?: string }) => Promise<LibraryItem>
        >(),
      update: vi.fn<(id: string, data: Partial<LibraryItem>) => Promise<LibraryItem>>(),
      delete: vi.fn<(id: string) => Promise<void>>(),
      countByUser: vi.fn<(userId: string) => Promise<number>>(),
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

    booksRepository = { findById: vi.fn() };

    libraryService = new LibraryService(
      libraryRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as ValkeyService,
      eventValidatorService as unknown as EventValidatorService,
      booksRepository as unknown as IBooksRepository,
    );
  });

  /**
   * `claimFreeBook` is the ONLY HTTP route to an entitlement, and it exists because `books.is_free`
   * defaults to `true` — so without it a reader could not obtain any free book at all.
   *
   * It replaced `POST /library`, which accepted a bare `{ bookId }` and wrote an `owned` row with no
   * price check, no payment check and no check the book was for sale. So the check has to be here, in
   * the service, and not in the controller: a controller check is bypassed by every other caller, and
   * `addToLibrary` has a second legitimate one (the payment grant) that must NOT be subject to it.
   */
  describe('claimFreeBook', () => {
    const freeBook = { id: 'book-1', isFree: true, deletedAt: null } as never;

    it('should add a genuinely free book', async () => {
      booksRepository.findById.mockResolvedValue(freeBook);
      libraryRepository.create.mockResolvedValue({ id: 'lib-1' } as never);

      const result = await libraryService.claimFreeBook('user-1', 'book-1');

      expect(result).toHaveProperty('id', 'lib-1');
      // `rentalId: null` and `status: 'owned'` are set by `addToLibrary`, which is the single write
      // path both callers share — so the claim does not get to choose its own status.
      expect(libraryRepository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        bookId: 'book-1',
        rentalId: null,
        status: 'owned',
      });
    });

    it('should REFUSE a book that is not free, by name, because that is the attack it replaces', async () => {
      // A paid book must only ever arrive through money. This is the assertion that closes
      // `POST /library`: without it, the same call with this book id would have granted ownership.
      booksRepository.findById.mockResolvedValue({ id: 'book-1', isFree: false, deletedAt: null } as never);

      await expect(libraryService.claimFreeBook('user-1', 'book-1')).rejects.toThrow('This book is not free');
      expect(libraryRepository.create).not.toHaveBeenCalled();
    });

    it('should say to buy it rather than that it does not exist', async () => {
      // The book exists and is visible, so pretending otherwise sends the reader hunting for a typo.
      booksRepository.findById.mockResolvedValue({ id: 'book-1', isFree: false, deletedAt: null } as never);

      await expect(libraryService.claimFreeBook('user-1', 'book-1')).rejects.toThrow('Purchase it');
    });

    it('should refuse a soft-deleted book', async () => {
      booksRepository.findById.mockResolvedValue({ id: 'book-1', isFree: true, deletedAt: new Date() } as never);

      await expect(libraryService.claimFreeBook('user-1', 'book-1')).rejects.toThrow('Book not found');
      expect(libraryRepository.create).not.toHaveBeenCalled();
    });

    it('should refuse a book that does not exist', async () => {
      booksRepository.findById.mockResolvedValue(null);

      await expect(libraryService.claimFreeBook('user-1', 'book-1')).rejects.toThrow('Book not found');
    });
  });

  describe('addToLibrary', () => {
    it('should add a book to library successfully', async () => {
      vi.mocked(libraryRepository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(libraryRepository.create).mockResolvedValue({
        ...mockLibraryItem,
        id: 'library-456',
      });

      const result = await libraryService.addToLibrary('user-123', { bookId: 'book-123' });

      expect(result).toHaveProperty('id', 'library-456');
      expect(result.status).toBe('owned');
      expect(libraryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          bookId: 'book-123',
          status: 'owned',
        }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('library.item.added', expect.any(Object));
    });

    it('should add a rented book to library', async () => {
      vi.mocked(libraryRepository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(libraryRepository.create).mockResolvedValue({
        ...mockLibraryItem,
        id: 'library-456',
        rentalId: 'rental-123',
        status: 'rented',
      });

      const result = await libraryService.addToLibrary('user-123', { bookId: 'book-123', rentalId: 'rental-123' });

      expect(result.status).toBe('rented');
      expect(result.rentalId).toBe('rental-123');
    });

    it('should throw ConflictException when book already in library', async () => {
      vi.mocked(libraryRepository.findByUserAndBook).mockResolvedValue(mockLibraryItem);

      await expect(libraryService.addToLibrary('user-123', { bookId: 'book-123' })).rejects.toThrow(
        'Book already in library',
      );
    });
  });

  describe('findMyLibrary', () => {
    it('should return paginated library items', async () => {
      const mockItems = [mockLibraryItem];
      vi.mocked(libraryRepository.findByUser).mockResolvedValue({ items: mockItems, total: 1 });

      const result = await libraryService.findMyLibrary('user-123', { page: 1, limit: 20 } as unknown as LibraryQuery);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('count', () => {
    it('should return the count of library items', async () => {
      vi.mocked(libraryRepository.countByUser).mockResolvedValue(5);

      const result = await libraryService.count('user-123');

      expect(result.count).toBe(5);
      expect(libraryRepository.countByUser).toHaveBeenCalledWith('user-123');
    });
  });

  describe('accessItem', () => {
    it('should update last accessed time', async () => {
      vi.mocked(libraryRepository.findById).mockResolvedValue(mockLibraryItem);
      vi.mocked(libraryRepository.update).mockResolvedValue({
        ...mockLibraryItem,
        lastAccessedAt: new Date(),
        status: 'reading',
      });

      const result = await libraryService.accessItem('library-123', 'user-123');

      expect(result.lastAccessedAt).not.toBeNull();
      expect(result.status).toBe('reading');
      expect(libraryRepository.update).toHaveBeenCalledWith(
        'library-123',
        expect.objectContaining({ status: 'reading', lastAccessedAt: expect.any(Date) }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('library.item.accessed', expect.any(Object));
    });

    it('should throw NotFoundException when library item not found', async () => {
      vi.mocked(libraryRepository.findById).mockResolvedValue(null);

      await expect(libraryService.accessItem('library-999', 'user-123')).rejects.toThrow('Library item not found');
    });
  });

  describe('removeFromLibrary', () => {
    it('should remove a book from library', async () => {
      vi.mocked(libraryRepository.findById).mockResolvedValue(mockLibraryItem);
      vi.mocked(libraryRepository.delete).mockResolvedValue(undefined);

      await libraryService.removeFromLibrary('library-123', 'user-123');

      expect(libraryRepository.delete).toHaveBeenCalledWith('library-123');
      expect(valkeyService.del).toHaveBeenCalledWith('library:library-123');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('library.item.removed', expect.any(Object));
    });

    it('should throw NotFoundException when library item not found', async () => {
      vi.mocked(libraryRepository.findById).mockResolvedValue(null);

      await expect(libraryService.removeFromLibrary('library-999', 'user-123')).rejects.toThrow(
        'Library item not found',
      );
    });

    it('should throw NotFoundException when user does not own the item', async () => {
      const otherUserItem = { ...mockLibraryItem, userId: 'user-456' };
      vi.mocked(libraryRepository.findById).mockResolvedValue(otherUserItem);

      await expect(libraryService.removeFromLibrary('library-123', 'user-123')).rejects.toThrow(
        'Library item not found',
      );
    });
  });
});
