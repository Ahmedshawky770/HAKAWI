import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BooksService } from './books.service.js';
import type { IBooksRepository } from './interfaces/books-repository.interface.js';
import { BOOKS_REPOSITORY } from './interfaces/books-repository.interface.js';
import type { Book, CreateBookInput, UpdateBookInput } from './types.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { ValkeyService } from '../../common/services/valkey.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockBooksRepository = Partial<IBooksRepository>;

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

type MockEventEmitter = {
  emit: ReturnType<typeof vi.fn>;
};

describe('BooksService', () => {
  let booksService: BooksService;
  let booksRepository: MockBooksRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: MockValkeyService;
  let eventEmitter: MockEventEmitter;

  const mockBook: Book = {
    id: 'book-123',
    title: 'Test Book',
    author: 'Test Author',
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
      findById: vi.fn(),
      findByIsbn: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      incrementViewCount: vi.fn(),
      incrementDownloadCount: vi.fn(),
      findByCategory: vi.fn(),
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

    eventEmitter = {
      emit: vi.fn(),
    };

    booksService = new BooksService(
      booksRepository as unknown as IBooksRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as ValkeyService,
      eventEmitter as unknown as EventEmitter2,
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
      expect(eventEmitter.emit).toHaveBeenCalledWith('book.created', expect.any(Object));
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

      const result = await booksService.update('book-123', updateInput);

      expect(result.title).toBe('Updated Title');
      expect(result.description).toBe('Updated description');
      expect(booksRepository.update).toHaveBeenCalledWith('book-123', expect.objectContaining(updateInput));
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.update('book-999', { title: 'New Title' })).rejects.toThrow('Book not found');
    });
  });

  describe('publish', () => {
    it('should publish a draft book', async () => {
      const draftBook = { ...mockBook, status: 'draft' as const, publishDate: null };
      const publishedBook = { ...draftBook, status: 'published' as const, publishDate: new Date() };

      vi.mocked(booksRepository.findById).mockResolvedValue(draftBook);
      vi.mocked(booksRepository.update).mockResolvedValue(publishedBook);

      const result = await booksService.publish('book-123');

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

      await expect(booksService.publish('book-123')).rejects.toThrow('Book is already published');
    });

    it('should throw ForbiddenException when book is archived', async () => {
      const archivedBook = { ...mockBook, status: 'archived' as const };
      vi.mocked(booksRepository.findById).mockResolvedValue(archivedBook);

      await expect(booksService.publish('book-123')).rejects.toThrow('Cannot publish an archived book');
    });
  });

  describe('archive', () => {
    it('should archive a published book', async () => {
      const publishedBook = { ...mockBook, status: 'published' as const };
      const archivedBook = { ...publishedBook, status: 'archived' as const };

      vi.mocked(booksRepository.findById).mockResolvedValue(publishedBook);
      vi.mocked(booksRepository.update).mockResolvedValue(archivedBook);

      const result = await booksService.archive('book-123');

      expect(result.status).toBe('archived');
      expect(booksRepository.update).toHaveBeenCalledWith(
        'book-123',
        expect.objectContaining({ status: 'archived' }),
      );
    });

    it('should throw ForbiddenException when book is already archived', async () => {
      const archivedBook = { ...mockBook, status: 'archived' as const };
      vi.mocked(booksRepository.findById).mockResolvedValue(archivedBook);

      await expect(booksService.archive('book-123')).rejects.toThrow('Book is already archived');
    });
  });

  describe('delete', () => {
    it('should soft delete a book', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(mockBook);
      vi.mocked(booksRepository.softDelete).mockResolvedValue(undefined);

      await booksService.delete('book-123');

      expect(booksRepository.softDelete).toHaveBeenCalledWith('book-123');
      expect(eventEmitter.emit).toHaveBeenCalledWith('book.deleted', expect.any(Object));
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.delete('book-999')).rejects.toThrow('Book not found');
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
});
