import { describe, it, expect, beforeEach, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { LibraryService } from './library.service.ts';
import type { ILibraryRepository } from './interfaces/library-repository.interface.ts';
import type { LibraryItem } from './types.ts';
import type { LibraryQuery } from './types.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockLibraryRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<LibraryItem | null>>>;
  findByUser: ReturnType<typeof vi.fn<(userId: string, params: { status?: string; page?: number; limit?: number }) => Promise<{ items: LibraryItem[]; total: number }>>>;
  findByUserAndBook: ReturnType<typeof vi.fn<(userId: string, bookId: string) => Promise<LibraryItem | null>>>;
  create: ReturnType<typeof vi.fn<(data: { userId: string; bookId: string; rentalId?: string | null; status?: string }) => Promise<LibraryItem>>>;
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
      findByUser: vi.fn<(userId: string, params: { status?: string; page?: number; limit?: number }) => Promise<{ items: LibraryItem[]; total: number }>>(),
      findByUserAndBook: vi.fn<(userId: string, bookId: string) => Promise<LibraryItem | null>>(),
      create: vi.fn<(data: { userId: string; bookId: string; rentalId?: string | null; status?: string }) => Promise<LibraryItem>>(),
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

    libraryService = new LibraryService(
      libraryRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as ValkeyService,
      eventValidatorService as unknown as EventValidatorService,
    );
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

      await expect(libraryService.addToLibrary('user-123', { bookId: 'book-123' })).rejects.toThrow('Book already in library');
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

      await expect(libraryService.removeFromLibrary('library-999', 'user-123')).rejects.toThrow('Library item not found');
    });

    it('should throw NotFoundException when user does not own the item', async () => {
      const otherUserItem = { ...mockLibraryItem, userId: 'user-456' };
      vi.mocked(libraryRepository.findById).mockResolvedValue(otherUserItem);

      await expect(libraryService.removeFromLibrary('library-123', 'user-123')).rejects.toThrow('Library item not found');
    });
  });
});
