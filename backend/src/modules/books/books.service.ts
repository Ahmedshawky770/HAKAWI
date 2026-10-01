import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import type {
  BookCreatedEvent,
  BookUpdatedEvent,
  BookPublishedEvent,
  BookArchivedEvent,
  BookDeletedEvent,
} from '../../common/events/books.events.ts';
import { PaymentsService } from '../payments/payments.service.ts';
import { RentalsService } from '../rentals/rentals.service.ts';
import type { Payment } from '../payments/interfaces/payments-repository.interface.ts';
import type { Rental } from '../rentals/types.ts';

import type { Book, CreateBookInput, UpdateBookInput, BooksListResponse } from './types.ts';
import { reviveBookDates, toBookResponse } from './types.ts';
import { BOOKS_REPOSITORY } from './interfaces/books-repository.interface.ts';
import type { IBooksRepository } from './interfaces/books-repository.interface.ts';

export const BOOK_CACHE_NAMESPACE = 'book';
export const BOOKS_CACHE_TAG = 'books';
export const BOOK_CACHE_TTL_SECONDS = 600;

/**
 * Cache key for an ISBN lookup. A book is readable by id and by ISBN, so it has two cache entries
 * and therefore two things to invalidate — see `invalidateBookCache`.
 */
export function bookIsbnCacheKey(isbn: string): string {
  return `isbn:${isbn}`;
}

@Injectable()
export class BooksService {
  constructor(
    @Inject(BOOKS_REPOSITORY) private readonly booksRepository: IBooksRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(TaggedCacheService) private readonly cache: TaggedCacheService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
    @Inject(RentalsService) private readonly rentalsService: RentalsService,
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
    // No invalidation here on purpose: a brand-new id or ISBN has no cached entry to retire, and a
    // lookup that found nothing is not cached either (`getOrSet` never stores a rejected load).
    await this.eventBus.emit('book.created', { bookId: book.id, userId } as BookCreatedEvent);
    return book;
  }

  async findById(id: string): Promise<Book> {
    const { value } = await this.cache.getOrSet<Book>({
      namespace: BOOK_CACHE_NAMESPACE,
      key: id,
      ttl: BOOK_CACHE_TTL_SECONDS,
      tags: [BOOKS_CACHE_TAG],
      // Without this the cached copy of a book carries ISO strings where the repository returns
      // `Date`s, and `toBookResponse` throws `TypeError: createdAt.toISOString is not a function`
      // on every cache hit while the first, cold request succeeds.
      revive: reviveBookDates,
      load: async () => {
        const book = await this.booksRepository.findById(id);
        if (!book || book.deletedAt) {
          throw new NotFoundException('Book not found');
        }
        return book;
      },
    });
    return value;
  }

  /**
   * Reads a book by ISBN through the same cache as {@link findById}.
   *
   * It used to bypass the cache entirely, which made the two read paths of the same row behave
   * differently: a GET by id was served from Valkey for 10 minutes, a GET by ISBN always hit
   * PostgreSQL. That divergence is invisible in tests and is exactly the "conflicting caches"
   * shape Principle #9 forbids — the same entity with two independent staleness windows. Both
   * paths are cached under the same tag with the same TTL, and `invalidateBookCache` drops both
   * keys, so the two can never disagree.
   */
  async findByIsbn(isbn: string): Promise<Book> {
    const { value } = await this.cache.getOrSet<Book>({
      namespace: BOOK_CACHE_NAMESPACE,
      key: bookIsbnCacheKey(isbn),
      ttl: BOOK_CACHE_TTL_SECONDS,
      tags: [BOOKS_CACHE_TAG],
      revive: reviveBookDates,
      load: async () => {
        const book = await this.booksRepository.findByIsbn(isbn);
        if (!book || book.deletedAt) {
          throw new NotFoundException('Book not found');
        }
        return book;
      },
    });
    return value;
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    categoryId?: string;
    status?: string;
    search?: string;
    author?: string;
  }): Promise<BooksListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const result = await this.booksRepository.findAll(params);
    const books = result.books.map((book) => toBookResponse(book));

    return {
      books,
      total: result.total,
      page,
      limit,
    };
  }

  async update(id: string, input: UpdateBookInput, userId: string): Promise<Book> {
    const existing = await this.booksRepository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    if (existing.author !== userId) {
      throw new ForbiddenException('You can only update your own books');
    }

    if (input.isbn && input.isbn !== existing.isbn) {
      const isbnExists = await this.booksRepository.findByIsbn(input.isbn);
      if (isbnExists) {
        throw new ConflictException('Book ISBN already exists');
      }
    }

    const book = await this.booksRepository.update(id, input);
    // Both the previous and the new ISBN: a renamed ISBN leaves the old key behind otherwise.
    await this.invalidateBookCache(id, existing.isbn, book.isbn);

    await this.eventBus.emit('book.updated', { bookId: id, updatedFields: input } as BookUpdatedEvent);
    return book;
  }

  async publish(id: string, userId: string): Promise<Book> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    if (book.author !== userId) {
      throw new ForbiddenException('You can only publish your own books');
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

    // Publishing changes status and sets `publishDate`, both of which are in the cached payload.
    // Without this the cache kept serving `status: 'draft'` and a null `publishDate` for the next
    // ten minutes — a stale read of the entity's own lifecycle.
    await this.invalidateBookCache(id, book.isbn, updated.isbn);

    await this.eventBus.emit('book.published', { bookId: id, publishedAt } as BookPublishedEvent);
    return updated;
  }

  async archive(id: string, userId: string): Promise<Book> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    if (book.author !== userId) {
      throw new ForbiddenException('You can only archive your own books');
    }

    if (book.status === 'archived') {
      throw new ForbiddenException('Book is already archived');
    }

    const updated = await this.booksRepository.update(id, { status: 'archived' });
    await this.invalidateBookCache(id, book.isbn, updated.isbn);

    await this.eventBus.emit('book.archived', { bookId: id } as BookArchivedEvent);
    return updated;
  }

  async purchase(userId: string, bookId: string, paymentMethodId?: string): Promise<Payment> {
    const book = await this.booksRepository.findById(bookId);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    if (book.author === userId) {
      throw new ForbiddenException('Cannot purchase your own book');
    }

    if (book.isFree) {
      throw new BadRequestException('This book is free, no purchase needed');
    }

    await this.booksRepository.incrementViewCount(bookId);
    // `viewCount` is part of the cached payload, so the counter bump has to retire this book's
    // entries or the next GET serves the pre-purchase count. Targeted invalidation — one DEL per
    // key — instead of a `books` sweep that evicted every other book in the deployment.
    await this.invalidateBookCache(bookId, book.isbn);
    const payment = await this.paymentsService.paymobInitializePayment(userId, book.price ?? 0, 'EGP', {
      bookId,
      type: 'purchase',
      paymentMethodId,
    });
    return await this.paymentsService.findById(payment.paymentId);
  }

  async rent(userId: string, bookId: string, durationDays: number): Promise<Rental> {
    const book = await this.booksRepository.findById(bookId);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    if (book.author === userId) {
      throw new ForbiddenException('Cannot rent your own book');
    }

    await this.booksRepository.incrementViewCount(bookId);
    await this.invalidateBookCache(bookId, book.isbn);
    return this.rentalsService.createRental(userId, { bookId, durationDays });
  }

  async delete(id: string, userId: string): Promise<void> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    if (book.author !== userId) {
      throw new ForbiddenException('You can only delete your own books');
    }

    await this.booksRepository.softDelete(id);
    await this.invalidateBookCache(id, book.isbn);

    await this.eventBus.emit('book.deleted', { bookId: id, userId: book.author } as BookDeletedEvent);
  }

  async incrementViewCount(id: string): Promise<void> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    await this.booksRepository.incrementViewCount(id);
    await this.invalidateBookCache(id, book.isbn);
  }

  async incrementDownloadCount(id: string): Promise<void> {
    const book = await this.booksRepository.findById(id);
    if (!book || book.deletedAt) {
      throw new NotFoundException('Book not found');
    }

    await this.booksRepository.incrementDownloadCount(id);
    await this.invalidateBookCache(id, book.isbn);
  }

  /**
   * Retires every cache entry that can represent this book: the id entry and the ISBN entry.
   *
   * WHY targeted and not a tag sweep: the `books` tag indexes *all* book entries, so
   * `invalidateTags([BOOKS_CACHE_TAG])` evicted every other book on every view, download, update
   * and publish — under read traffic the hit rate collapsed towards zero while still paying two
   * `SMEMBERS` + N `DEL` round trips per request. Deleting only this book's keys gives the same
   * correctness for the row that actually changed (the tag generation bump inside `invalidateKey`
   * makes the deletion visible to in-flight readers, which is what made the sweep necessary)
   * without turning one book's write into a cache-wide event.
   *
   * Callers pass every ISBN the row has been cached under — including the previous one when the
   * ISBN itself changed, otherwise the old key would keep serving the pre-rename book.
   */
  private async invalidateBookCache(id: string, ...isbns: readonly (string | null | undefined)[]): Promise<void> {
    await this.cache.invalidateKey(BOOK_CACHE_NAMESPACE, id, [BOOKS_CACHE_TAG]);
    for (const isbn of new Set(isbns.filter((value): value is string => typeof value === 'string' && value !== ''))) {
      await this.cache.invalidateKey(BOOK_CACHE_NAMESPACE, bookIsbnCacheKey(isbn), [BOOKS_CACHE_TAG]);
    }
  }
}
