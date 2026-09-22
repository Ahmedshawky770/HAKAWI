import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BooksService } from './books.service.js';
import type { BooksRepository } from '../repositories/books.repository.js';
import type { BookFilters } from '../interfaces/books-repository.interface.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import type { CreateBookDto, UpdateBookDto } from '../dto/books.dto.js';

type MockBooksRepository = {
  findById: ReturnType<typeof vi.fn>;
  findByOwnerId: ReturnType<typeof vi.fn>;
  findPublished: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

type MockEventEmitter2 = {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
};

const createMockBook = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'book-123',
  ownerId: 'user-123',
  title: 'Test Book',
  subtitle: null,
  authorName: 'Test Author',
  coverImage: null,
  pdfUrl: null,
  pdfPages: null,
  price: 9.99,
  isAvailable: true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('BooksService', () => {
  let booksService: BooksService;
  let booksRepository: MockBooksRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    booksRepository = {
      findById: vi.fn(),
      findByOwnerId: vi.fn(),
      findPublished: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    booksService = new BooksService(
      booksRepository as unknown as BooksRepository,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('findById', () => {
    it('should return book when found', async () => {
      const book = createMockBook();
      vi.mocked(booksRepository.findById).mockResolvedValue(book as any);

      const result = await booksService.findById('book-123');

      expect(result).toEqual(book);
    });

    it('should throw NotFoundException when book not found', async () => {
      vi.mocked(booksRepository.findById).mockResolvedValue(null);

      await expect(booksService.findById('book-123')).rejects.toThrow('Book not found');
    });

    it('should throw NotFoundException when book is soft deleted', async () => {
      const deletedBook = createMockBook({ deletedAt: new Date() });
      vi.mocked(booksRepository.findById).mockResolvedValue(deletedBook as any);

      await expect(booksService.findById('book-123')).rejects.toThrow('Book not found');
    });
  });

  describe('findByOwnerId', () => {
    it('should return books by owner', async () => {
      const books = [createMockBook()];
      vi.mocked(booksRepository.findByOwnerId).mockResolvedValue(books as any);

      const result = await booksService.findByOwnerId('user-123');

      expect(result).toEqual(books);
    });
  });

  describe('findPublished', () => {
    it('should return published books with filters', async () => {
      const books = [createMockBook()];
      const filters: BookFilters = { category: 'fiction' };
      vi.mocked(booksRepository.findPublished).mockResolvedValue(books as any);

      const result = await booksService.findPublished(filters);

      expect(result).toEqual(books);
    });
  });

  describe('create', () => {
    it('should create book and emit event', async () => {
      const data: CreateBookDto = {
        title: 'New Book',
        authorName: 'Author Name',
        price: 9.99,
        isAvailable: true,
      };
      const createdBook = createMockBook({ title: data.title, authorName: data.authorName });
      vi.mocked(booksRepository.create).mockResolvedValue(createdBook as any);

      const result = await booksService.create('user-123', data);

      expect(result).toEqual(createdBook);
      expect(eventEmitter.emit).toHaveBeenCalledWith('book.created', {
        bookId: 'book-123',
        authorId: 'user-123',
        title: 'New Book',
        price: 9.99,
      });
    });
  });

  describe('update', () => {
    it('should update book when owner matches', async () => {
      const book = createMockBook({ ownerId: 'user-123' });
      const updatedBook = createMockBook({ title: 'Updated Book' });
      vi.mocked(booksRepository.findById).mockResolvedValue(book as any);
      vi.mocked(booksRepository.update).mockResolvedValue(updatedBook as any);

      const result = await booksService.update('book-123', 'user-123', { title: 'Updated Book' } as UpdateBookDto);

      expect(result).toEqual(updatedBook);
    });

    it('should throw BadRequestException when owner does not match', async () => {
      const book = createMockBook({ ownerId: 'other-user' });
      vi.mocked(booksRepository.findById).mockResolvedValue(book as any);

      await expect(booksService.update('book-123', 'user-123', { title: 'Updated' } as UpdateBookDto))
        .rejects.toThrow('You can only update your own books');
    });
  });

  describe('delete', () => {
    it('should delete book when owner matches', async () => {
      const book = createMockBook({ ownerId: 'user-123' });
      vi.mocked(booksRepository.findById).mockResolvedValue(book as any);
      vi.mocked(booksRepository.delete).mockResolvedValue(undefined as any);

      await booksService.delete('book-123', 'user-123');

      expect(booksRepository.delete).toHaveBeenCalledWith('book-123');
    });

    it('should throw BadRequestException when owner does not match', async () => {
      const book = createMockBook({ ownerId: 'other-user' });
      vi.mocked(booksRepository.findById).mockResolvedValue(book as any);

      await expect(booksService.delete('book-123', 'user-123')).rejects.toThrow('You can only delete your own books');
    });
  });
});
