import { Injectable, NotFoundException, ConflictException, ForbiddenException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import type { BookCreatedEvent, BookUpdatedEvent, BookPublishedEvent, BookArchivedEvent, BookDeletedEvent } from '../../common/events/books.events.ts';

import type { IBooksRepository } from './interfaces/books-repository.interface.ts';
import { BOOKS_REPOSITORY } from './interfaces/books-repository.interface.ts';
import type { Book, CreateBookInput, UpdateBookInput, BookResponse, BooksListResponse } from './types.ts';

@Injectable()
export class BooksService {
  constructor(
    @Inject(BOOKS_REPOSITORY) private readonly booksRepository: IBooksRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async create(userId: string, input: CreateBookInput): Promise<Book> {
    if (input.isbn) {
      const existing = await this.booksRepository.findByIsbn(input.isbn);
      if (existing) {
        throw new ConflictException('Book ISBN already exists');
      }
    }

    const data: CreateBookInput = {
      ...input,
      status: 'draft',
      viewCount: 0,
      likeCount: 0,
      downloadCount: 0,
    };

    const book = await this.booksRepository.create(data);
    await this.eventBus.emit('book.created', { bookId: book.id, userId } as BookCreatedEvent);
    return book;
  }

  async findById(id: string): Promise<Book> {
    const cached = await this.valkeyService.get(`book:${id}`);
    if (cached) {
      return JSON.parse(cached) as Book;
    }

    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    await this.valkeyService.set(`book:${id}`, JSON.stringify(book), 600);
    return book;
  }

  async findByIsbn(isbn: string): Promise<Book> {
    const book = await this.booksRepository.findByIsbn(isbn);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }
    return book;
  }

  async findAll(params: { page?: number; limit?: number; categoryId?: string; status?: string; search?: string; author?: string }): Promise<BooksListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const result = await this.booksRepository.findAll(params);
    const books = result.books.map((book) => this.toBookResponse(book));

    return {
      books,
      total: result.total,
      page,
      limit,
    };
  }

  async update(id: string, input: UpdateBookInput): Promise<Book> {
    const existing = await this.booksRepository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    if (input.isbn && input.isbn !== existing.isbn) {
      const isbnExists = await this.booksRepository.findByIsbn(input.isbn);
      if (isbnExists) {
        throw new ConflictException('Book ISBN already exists');
      }
    }

    const book = await this.booksRepository.update(id, input);
    await this.valkeyService.del(`book:${id}`);

    await this.eventBus.emit('book.updated', { bookId: id, updatedFields: input } as BookUpdatedEvent);
    return book;
  }

  async publish(id: string): Promise<Book> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    if (book.status === 'published') {
      throw new ForbiddenException('Book is already published');
    }

    if (book.status === 'archived') {
      throw new ForbiddenException('Cannot publish an archived book');
    }

    const publishedAt = new Date();
    const updated = await this.booksRepository.update(id, {
      status: 'published',
      publishDate: publishedAt,
    });

    await this.eventBus.emit('book.published', { bookId: id, publishedAt } as BookPublishedEvent);
    return updated;
  }

  async archive(id: string): Promise<Book> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    if (book.status === 'archived') {
      throw new ForbiddenException('Book is already archived');
    }

    const updated = await this.booksRepository.update(id, { status: 'archived' });
    await this.valkeyService.del(`book:${id}`);

    await this.eventBus.emit('book.archived', { bookId: id } as BookArchivedEvent);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    await this.booksRepository.softDelete(id);
    await this.valkeyService.del(`book:${id}`);

    await this.eventBus.emit('book.deleted', { bookId: id, userId: book.author } as BookDeletedEvent);
  }

  async incrementViewCount(id: string): Promise<void> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    await this.booksRepository.incrementViewCount(id);
  }

  async incrementDownloadCount(id: string): Promise<void> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    await this.booksRepository.incrementDownloadCount(id);
  }

  private toBookResponse(book: Book): BookResponse {
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      description: book.description,
      coverImage: book.coverImage,
      isbn: book.isbn,
      publisher: book.publisher,
      publishDate: book.publishDate?.toISOString() ?? null,
      language: book.language,
      pageCount: book.pageCount,
      fileUrl: book.fileUrl,
      fileType: book.fileType,
      price: book.price,
      isFree: book.isFree,
      status: book.status,
      categoryId: book.categoryId,
      views: book.viewCount,
      likes: book.likeCount,
      downloads: book.downloadCount,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    };
  }
}
